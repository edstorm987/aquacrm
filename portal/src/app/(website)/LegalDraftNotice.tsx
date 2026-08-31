import { ShieldAlert } from "lucide-react";

/**
 * The banner that stops a draft legal page from being mistaken for a real one.
 *
 * The demo terms and privacy notice ship as SHELLS: the structure is there so
 * the gate can link to something and record which version was agreed, but the
 * wording is not the solicitor's (ED-QUESTIONS Q5). A draft that does not say
 * it is a draft is worse than no page at all, so this notice is not optional
 * decoration — it is the honest half of the page.
 */
export function LegalDraftNotice({ version }: { version: string }) {
  return (
    <p
      data-testid="legal-draft-notice"
      className="flex items-start gap-3 rounded-md border border-[#E6C77A] bg-[#FFF8E7] px-4 py-4 text-sm leading-6 text-[#5B4712]"
    >
      <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <strong>Draft wording — not yet reviewed by a solicitor.</strong> This
        page exists so the demo gate has something real to link to and a version
        to record against your consent. It is not final legal wording and should
        not be relied on as such. Version recorded: <code>{version}</code>.
      </span>
    </p>
  );
}
