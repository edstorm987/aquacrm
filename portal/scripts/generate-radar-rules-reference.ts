// Generates the COMPLETE enumeration of every Radar rule (all 2,052) straight
// from the source-of-truth catalogue, so nothing is left implicit. Run under tsx:
//
//   npx tsx scripts/generate-radar-rules-reference.ts
//
// Writes docs/reference/radar-rules.md — every rule id, grouped domain → family,
// with what each lens checks. Re-run after editing radarRuleCatalog.ts.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  RADAR_RULE_LENSES,
  RADAR_SIGNAL_FAMILIES,
  BUSINESS_RADAR_RULE_CATALOG,
} from "../src/engines/data/radar/radarRuleCatalog";

const OUT = join(process.cwd(), "docs", "reference");
mkdirSync(OUT, { recursive: true });

const domains = Object.keys(RADAR_SIGNAL_FAMILIES) as Array<keyof typeof RADAR_SIGNAL_FAMILIES>;
let familyCount = 0;
for (const d of domains) familyCount += RADAR_SIGNAL_FAMILIES[d].length;

let md = `# Radar rule reference — every rule (all ${BUSINESS_RADAR_RULE_CATALOG.length})\n\n`;
md += `← Back to [the reference index](00-index.md) · [the Radar dossier](../workspace/radar.md)\n\n`;
md += `The complete enumeration of the Radar catalogue: **${familyCount} signal families × ${RADAR_RULE_LENSES.length} lenses = ${BUSINESS_RADAR_RULE_CATALOG.length} rules**. `;
md += `Generated from \`src/engines/data/radar/radarRuleCatalog.ts\` by \`scripts/generate-radar-rules-reference.ts\` — re-run after editing the catalogue.\n\n`;
md += `Rule id = \`radar:{domain}:{family}:{lens}\`. Each family below lists all ${RADAR_RULE_LENSES.length} of its lens rules; the [Radar dossier](../workspace/radar.md) explains how each lens actually evaluates (the shared logic is identical across families).\n\n`;

md += `## The ${RADAR_RULE_LENSES.length} lenses (applied to every family)\n\n`;
md += `| Lens | Checks |\n|---|---|\n`;
for (const l of RADAR_RULE_LENSES) md += `| \`${l.id}\` | ${l.description} |\n`;
md += `\n---\n\n`;

for (const domain of domains) {
  const fams = RADAR_SIGNAL_FAMILIES[domain];
  md += `## \`${domain}\` — ${fams.length} families (${fams.length * RADAR_RULE_LENSES.length} rules)\n\n`;
  for (const fam of fams) {
    md += `### ${fam.label} — \`${fam.id}\`\n`;
    md += `${fam.description}\n\n`;
    md += `| Rule id | Lens |\n|---|---|\n`;
    for (const lens of RADAR_RULE_LENSES) {
      md += `| \`radar:${domain}:${fam.id}:${lens.id}\` | ${lens.label} |\n`;
    }
    md += `\n`;
  }
}

writeFileSync(join(OUT, "radar-rules.md"), md);
console.log(`Wrote docs/reference/radar-rules.md`);
console.log(`Domains: ${domains.length}  Families: ${familyCount}  Rules: ${BUSINESS_RADAR_RULE_CATALOG.length}`);
