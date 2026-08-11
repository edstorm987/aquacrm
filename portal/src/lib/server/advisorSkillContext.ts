import "server-only";

import type { AdvisorSkill } from "@/lib/advisorSkills";
import { listClients } from "@/server/tenants";
import { buildAdvisorContext } from "./advisorContext";

export async function buildAdvisorSkillContext(
  agencyId: string,
  skill: AdvisorSkill,
  now = Date.now(),
  suppliedContext?: Awaited<ReturnType<typeof buildAdvisorContext>>,
) {
  const context = suppliedContext ?? await buildAdvisorContext(agencyId, now);
  const radar = context.businessRadar;
  const scopedIssues = (domains: string[]) => radar.incidents
    .filter(issue => domains.includes(issue.domain))
    .slice(0, skill.maxRecords);
  const scopedSignals = (domains: string[]) => radar.signals
    .filter(signal => domains.includes(signal.domain))
    .slice(0, skill.maxRecords);
  const scopedCoverage = (domains: string[]) => radar.coverage
    .filter(source => domains.includes(source.domain));
  const scopedChecks = (domains: string[]) => radar.checks
    .filter(check => domains.includes(check.domain) && check.status !== "pass" && check.status !== "inactive")
    .sort((left, right) => radarCheckRank(left.status) - radarCheckRank(right.status))
    .slice(0, skill.maxRecords);
  let data: Record<string, unknown>;

  if (skill.recipeId === "lead-response-triage") {
    data = {
      memory: radar.memory,
      evidence: radar.evidence,
      speedToLead: radar.speedToLead,
      issues: scopedIssues(["sales", "inbox", "marketing"]),
      signals: scopedSignals(["sales", "inbox", "marketing"]),
      coverage: scopedCoverage(["sales", "inbox", "marketing"]),
      checks: scopedChecks(["sales", "inbox", "marketing"]),
    };
  } else if (skill.recipeId === "client-health-review") {
    data = {
      memory: radar.memory,
      evidence: radar.evidence,
      clients: listClients(agencyId).slice(0, skill.maxRecords).map(client => ({
        id: client.id,
        name: client.name,
        stage: client.stage,
        status: client.status,
        updatedAt: client.updatedAt,
        lastContactedAt: (client.metadata as { lastContactedAt?: number } | undefined)?.lastContactedAt,
      })),
      issues: scopedIssues(["clients", "inbox", "delivery"]),
      signals: scopedSignals(["clients", "inbox", "delivery"]),
      alerts: context.operationalAlerts.filter(alert => ["client", "support", "meeting"].includes(alert.category)).slice(0, skill.maxRecords),
      checks: scopedChecks(["clients", "inbox", "delivery", "development"]),
    };
  } else if (skill.recipeId === "finance-guard") {
    data = {
      memory: radar.memory,
      evidence: radar.evidence,
      company: context.company,
      issues: scopedIssues(["finance", "compliance", "company"]),
      signals: scopedSignals(["finance", "compliance", "company"]),
      coverage: scopedCoverage(["finance", "compliance", "company"]),
      alerts: context.operationalAlerts.filter(alert => ["money", "contract", "compliance"].includes(alert.category)).slice(0, skill.maxRecords),
      checks: scopedChecks(["finance", "compliance", "company"]),
    };
  } else if (skill.recipeId === "delivery-blockers") {
    data = {
      memory: radar.memory,
      evidence: radar.evidence,
      issues: scopedIssues(["delivery", "operations", "clients", "development"]),
      signals: scopedSignals(["delivery", "operations", "clients", "development"]),
      openTasks: context.openTasks.slice(0, skill.maxRecords),
      alerts: context.operationalAlerts.filter(alert => ["task", "client", "development", "outage"].includes(alert.category)).slice(0, skill.maxRecords),
      checks: scopedChecks(["delivery", "operations", "clients", "development"]),
    };
  } else if (skill.recipeId === "reply-drafter") {
    data = {
      instruction: "Draft only from details explicitly supplied by the user in this conversation. Do not send, mark read, change status, or load another conversation.",
      inboxRadar: scopedIssues(["inbox", "sales"]).slice(0, 10),
    };
  } else if (skill.recipeId === "priority-task-proposal") {
    data = {
      memory: radar.memory,
      evidence: radar.evidence,
      incidents: radar.incidents.slice(0, skill.maxRecords),
      openTasks: context.openTasks.slice(0, 100),
      instruction: "Return proposals only. Creating a task requires the separate single-task-create skill and human approval.",
    };
  } else if (skill.recipeId === "single-task-create") {
    data = {
      instruction: "You cannot create a record from chat. Prepare exactly one title, note, priority and evidence preview for explicit human approval.",
      allowedMutation: "task.create",
      maximumRecords: 1,
      deleteAllowed: false,
      updateAllowed: false,
    };
  } else {
    data = {
      company: context.company,
      radar: {
        summary: radar.summary,
        adaptive: radar.adaptive,
        memory: radar.memory,
        evidence: radar.evidence,
        speedToLead: radar.speedToLead,
        incidents: radar.incidents.slice(0, skill.maxRecords),
        signals: radar.signals.slice(0, skill.maxRecords),
        coverage: radar.coverage,
        domains: radar.domains,
        attentionChecks: radar.checks
          .filter(check => check.status !== "pass" && check.status !== "inactive")
          .sort((left, right) => radarCheckRank(left.status) - radarCheckRank(right.status))
          .slice(0, skill.maxRecords),
      },
      openTasks: context.openTasks.slice(0, Math.min(100, skill.maxRecords)),
      operationalAlerts: context.operationalAlerts.slice(0, Math.min(80, skill.maxRecords)),
    };
  }

  const payload = {
    generatedAt: context.generatedAt,
    skill: {
      id: skill.skillId,
      recipeId: skill.recipeId,
      access: skill.access,
      approval: skill.approval,
      scopes: skill.scopes,
      maxRecords: skill.maxRecords,
    },
    data,
  };
  return { payload, serialized: JSON.stringify(payload), truncated: false };
}

function radarCheckRank(status: string): number {
  if (status === "critical") return 0;
  if (status === "warning") return 1;
  if (status === "blind") return 2;
  if (status === "watch") return 3;
  if (status === "learning") return 4;
  return 5;
}
