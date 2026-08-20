import Link from "next/link";
import { BookOpen, Download, Settings2 } from "lucide-react";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";

interface ProductSopLinks {
  id: string;
  name: string;
  sopIds: string[];
  sopCategories: string[];
}

interface LinkedSop {
  id: string;
  title: string;
  kind: "written" | "file";
  resourceType?: "procedure" | "document" | "presentation" | "video" | "audio" | "image" | "spreadsheet";
  category?: string;
  categories?: string[];
  tags: string[];
  content?: string;
  fileName?: string;
  updatedAt: number;
}

const TAG_LABELS: Record<string, string> = {
  sales:     "Sales & Discovery",
  service:   "Onboarding & Service Delivery",
  leads:     "Leads & Nurturing",
  standards: "Standards & Internal",
  mastery:   "Mastery Plan",
};

const SOP_PROMPTS: Record<string, string[]> = {
  sales: [
    "Discovery call notes captured",
    "Budget, offer, and buying reason recorded",
    "Next step and follow-up owner clear",
  ],
  service: [
    "Client portal created and checked",
    "Access details sent to the client",
    "Build milestones visible to the team",
  ],
  leads: [
    "Lead source and tags recorded",
    "Meeting or follow-up date set",
    "Conversion notes transferred to client record",
  ],
  standards: [
    "Brand assets stored",
    "Important links attached",
    "Risks, blockers, and decisions written down",
  ],
  mastery: [
    "Performance review cadence set",
    "Support owner assigned",
    "Growth opportunities logged",
  ],
};

export function ClientSopsTab({
  clientId,
  families,
  phaseLabel,
  products,
  sops,
}: {
  clientId: string;
  families: readonly string[];
  phaseLabel: string;
  products: ProductSopLinks[];
  sops: LinkedSop[];
}) {
  const prompts = families.flatMap(family => (
    SOP_PROMPTS[family] ?? [`Write the ${TAG_LABELS[family] ?? family} process for this client.`]
  ));
  const linkedSops = sops.filter(sop => products.some(product => (
    product.sopIds.includes(sop.id)
    || product.sopCategories.some(category => sopCategories(sop).some(item => item.toLowerCase() === category.toLowerCase()))
  )));
  const manageHref = `${clientWorkspaceHref(clientId, "delivery", { product: products[0]?.id })}#service-assignment`;

  return (
    <section id="client-sops" className="scroll-mt-24 overflow-hidden rounded-xl border border-black/10 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase text-black/40">Delivery knowledge</p>
          <h2 className="mt-1 text-lg font-semibold text-black/85">SOPs linked to assigned services</h2>
          <p className="mt-1 text-xs text-black/48">{linkedSops.length} linked · {products.length} assigned service{products.length === 1 ? "" : "s"} · {phaseLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={manageHref} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Settings2 size={14} /> Manage client service</Link>
        </div>
      </header>

      <div className="divide-y divide-black/[0.08]">
        {linkedSops.length ? linkedSops.map(sop => {
          const productNames = products.filter(product => product.sopIds.includes(sop.id) || product.sopCategories.some(category => sopCategories(sop).some(item => item.toLowerCase() === category.toLowerCase()))).map(product => product.name);
          return <article id={`client-sop-${sop.id}`} key={sop.id} className="scroll-mt-24 grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-black/78">{sop.title}</h3>
                <span className="rounded-full bg-black/[0.045] px-2 py-0.5 text-[9px] font-semibold uppercase text-black/45">{sop.resourceType ?? sop.kind}</span>
              </div>
              <p className="mt-1 text-xs text-black/42">{productNames.join(" · ")}{sopCategories(sop).length ? ` · ${sopCategories(sop).join(" · ")}` : ""}</p>
              {sop.kind === "written" ? <details className="group mt-3 border-l-2 border-black/10 pl-3"><summary className="cursor-pointer list-none text-xs font-semibold text-[#315b85]">Read procedure <span className="group-open:hidden">+</span><span className="hidden group-open:inline">-</span></summary><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/58">{sop.content || "This procedure has no written content yet."}</p></details> : null}
            </div>
            {sop.kind === "file" ? <a href={`/api/portal/sops/content?id=${encodeURIComponent(sop.id)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/12 px-3 text-xs font-semibold text-black/62 hover:bg-black/[0.03]"><Download size={14} /> Open {sop.fileName ? "file" : "SOP"}</a> : null}
          </article>;
        }) : <div className="px-5 py-8 text-center">
          <BookOpen size={20} className="mx-auto text-black/25" />
          <p className="mt-3 text-sm font-semibold text-black/68">No SOPs are linked to these services yet</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-black/45">Link individual procedures or SOP categories on the product. Every client assigned that product will then inherit the same operating playbook.</p>
          <Link href={manageHref} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md bg-black px-3 text-xs font-semibold text-white"><Settings2 size={14} /> Link SOPs to products</Link>
        </div>}
      </div>

      <details className="group border-t border-black/10 bg-black/[0.018]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-xs font-semibold text-black/58"><span>Suggested {phaseLabel} checks · {prompts.length}</span><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span></summary>
        <ul className="grid gap-px border-t border-black/[0.08] bg-black/[0.08] md:grid-cols-2">
          {prompts.map(prompt => <li key={prompt} className="bg-white px-4 py-3 text-xs text-black/58">{prompt}</li>)}
        </ul>
      </details>
    </section>
  );
}

function sopCategories(sop: LinkedSop): string[] {
  return [...new Set([...(sop.categories ?? []), ...(sop.category ? [sop.category] : [])].map(value => value.trim()).filter(Boolean))];
}
