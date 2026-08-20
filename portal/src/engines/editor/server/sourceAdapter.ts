import "server-only";

import type { EditAdapter, EditDocument, EditPlan, EditTarget } from "@/engines/editor/editing/engine";
import { formatSourceStamp } from "./sourceStamp";
import type { SiteRegistry } from "./registry";

/**
 * Website source, as something the shared editing engine can drive.
 *
 * The mapping is almost one-to-one, which is the point: a registry node is an
 * edit target, a line hash is a fingerprint, and a stale commit is a stale
 * document. Nothing about conflicts, all-or-nothing publishing or dry runs
 * lives here — that is the engine's job, and it is the same job for a client
 * portal.
 *
 * `dynamic` becomes `indirect` rather than "read-only": the operator is sent to
 * the component that renders the value, which is what Ed asked for. Text bound
 * to props cannot be patched in place, but the code producing it can.
 */
export function sourceEditAdapter(input: {
  registry: SiteRegistry;
  /** The repository's HEAD right now, so a moved branch is caught. */
  headSha: () => Promise<string>;
  /** Commits the plan. Supplied by the caller so nothing here can write. */
  commit: (plan: EditPlan) => Promise<{ revision: string; summary: string }>;
}): EditAdapter {
  const { registry } = input;
  return {
    async map(): Promise<EditDocument> {
      const targets: EditTarget[] = Object.values(registry.nodes)
        // A blank line is not something anybody selects, and listing thousands
        // of them buries the ones that matter. Lines with dynamic content stay:
        // they are precisely the ones somebody opens to edit the component.
        .filter(node => Boolean(node.text))
        .map(node => ({
          id: node.key,
          label: `${node.file}:${node.line}`,
          kind: node.kind === "literal" ? "direct" : "indirect",
          value: node.text,
          fingerprint: node.hash,
          definedAt: node.kind === "dynamic" ? `${node.file}:${node.line}` : undefined,
        }));
      return {
        id: `site:${registry.repository}@${registry.ref}`,
        label: `${registry.repository} (${registry.ref})`,
        revision: registry.commitSha,
        targets,
      };
    },
    currentRevision: input.headSha,
    publish: input.commit,
  };
}

export { formatSourceStamp };
