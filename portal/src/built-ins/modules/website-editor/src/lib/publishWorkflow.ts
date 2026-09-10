// Pure orchestration for the editor's three-stage publish action. Keeping this
// outside the React component makes the stop-before-GitHub invariant directly
// testable: a failed active-page publish can never be treated as best effort.

export type SitePublishWorkflowStage = "content" | "active-page" | "github-promote";

export class SitePublishWorkflowError extends Error {
  readonly code = "site_publish_workflow_failed";

  constructor(
    readonly stage: SitePublishWorkflowStage,
    readonly contentPublished: boolean,
    readonly activePagePublished: boolean,
  ) {
    super(
      stage === "content"
        ? "Content was not published. The active page and GitHub promotion were not attempted."
        : stage === "active-page"
          ? "The active page was not published. Content drafts were already published in Aqua; GitHub promotion was not requested."
          : activePagePublished
            ? "GitHub promotion failed after the Aqua content and active page were published."
            : "GitHub promotion failed after the Aqua content was published.",
    );
    this.name = "SitePublishWorkflowError";
  }
}

export interface SitePublishWorkflowInput<TResult> {
  publishContent(): Promise<void>;
  publishActivePage?: () => Promise<void>;
  promoteToGitHub(): Promise<TResult>;
  onStep?(stage: SitePublishWorkflowStage): void;
}

export interface PublishPreviewPage {
  id: string;
  slug: string;
  title: string;
}

/**
 * The current command publishes at most the active editor page. Keep the modal
 * copy derived from the same invariant so other dirty pages are never presented
 * as part of this action.
 */
export function partitionPublishPreviewPages<TPage extends PublishPreviewPage>(
  changedPages: readonly TPage[],
  activePageId: string | null,
): { activePage: TPage | null; deferredPages: TPage[] } {
  const activePage = activePageId
    ? changedPages.find(page => page.id === activePageId) ?? null
    : null;
  return {
    activePage,
    deferredPages: changedPages.filter(page => page.id !== activePage?.id),
  };
}

export function sitePublishSuccessMessage(activePageId: string | null): string {
  const published = activePageId
    ? "Content drafts and the active editor page were published inside Aqua."
    : "Content drafts were published inside Aqua; no editor page was active, so no page draft was published.";
  return `${published} Other changed pages were not included and must be opened and published separately.`;
}

export async function runSitePublishWorkflow<TResult>(
  input: SitePublishWorkflowInput<TResult>,
): Promise<TResult> {
  input.onStep?.("content");
  try {
    await input.publishContent();
  } catch {
    throw new SitePublishWorkflowError("content", false, false);
  }

  let activePagePublished = false;
  if (input.publishActivePage) {
    input.onStep?.("active-page");
    try {
      await input.publishActivePage();
      activePagePublished = true;
    } catch {
      throw new SitePublishWorkflowError("active-page", true, false);
    }
  }

  input.onStep?.("github-promote");
  try {
    return await input.promoteToGitHub();
  } catch {
    throw new SitePublishWorkflowError("github-promote", true, activePagePublished);
  }
}
