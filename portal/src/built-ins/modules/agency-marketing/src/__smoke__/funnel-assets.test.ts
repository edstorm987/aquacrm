// Funnel workspace persistence smoke. node:test via tsx --test.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createMarketingAssetHandler,
  listMarketingAssetsHandler,
  updateMarketingAssetHandler,
} from "../api/handlers";
import type { PluginCtx, PluginStorage } from "../lib/aquaPluginTypes";

function buildContext() {
  const data = new Map<string, unknown>();
  const storage: PluginStorage = {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return data.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      data.set(key, value);
    },
    async del(key: string): Promise<void> {
      data.delete(key);
    },
    async list(prefix?: string): Promise<string[]> {
      const keys = [...data.keys()];
      return prefix ? keys.filter(key => key.startsWith(prefix)) : keys;
    },
  };

  return {
    agencyId: "agency_funnel_smoke",
    storage,
  } as unknown as PluginCtx;
}

test("funnel workspace configuration survives create, update, and filtered list", async () => {
  const ctx = buildContext();
  const createResponse = await createMarketingAssetHandler(
    new Request("http://localhost/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "funnel",
        name: "Website systems check",
        companyIds: ["company_aqua", "company_aqua", "company_crm"],
        owner: "Ed",
        objective: "Book a systems review",
        funnel: {
          format: "multi-step",
          previewUrl: "http://localhost:3035/systems-check",
          productionUrl: "https://aquaoasis-web.com/systems-check",
          editorUrl: "/portal/agency/development/projects/aqua_site",
          repositoryUrl: "https://github.com/edstorm987/aquaoasis-web.com",
          localPath: "/Projects/aquaoasis-web",
          developmentProjectId: "aqua_site",
          primaryGoal: "Qualified discovery calls",
          primaryCta: "Check my systems",
          conversionEvent: "systems_check_completed",
          telemetrySiteKey: "aqua-oasis-web",
          telemetryPropertyId: "property_123",
          steps: [
            {
              id: "step_intro",
              name: "Introduction",
              path: "/systems-check",
              kind: "landing",
              headline: "See the blind spots holding the business back",
              ctaLabel: "Start",
            },
            {
              id: "step_form",
              name: "Systems questions",
              path: "/systems-check/questions",
              kind: "form",
              headline: "Tell us how the business runs",
              ctaLabel: "Continue",
            },
            { id: "ignored", path: "/missing-name", kind: "custom" },
          ],
        },
      }),
    }),
    ctx,
  );

  assert.equal(createResponse.status, 201);
  const createdBody = await createResponse.json() as {
    ok: boolean;
    asset: {
      id: string;
      companyIds: string[];
      funnel: {
        format: string;
        repositoryUrl: string;
        editorUrl: string;
        conversionEvent: string;
        steps: Array<{ id: string; name: string; kind: string }>;
      };
    };
  };
  assert.equal(createdBody.ok, true);
  assert.deepEqual(createdBody.asset.companyIds, ["company_aqua", "company_crm"]);
  assert.equal(createdBody.asset.funnel.format, "multi-step");
  assert.equal(createdBody.asset.funnel.repositoryUrl, "https://github.com/edstorm987/aquaoasis-web.com");
  assert.equal(createdBody.asset.funnel.editorUrl, "/portal/agency/development/projects/aqua_site");
  assert.equal(createdBody.asset.funnel.conversionEvent, "systems_check_completed");
  assert.equal(createdBody.asset.funnel.steps.length, 2);
  assert.equal(createdBody.asset.funnel.steps[1]?.kind, "form");

  const updateResponse = await updateMarketingAssetHandler(
    new Request("http://localhost/assets", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: createdBody.asset.id,
        patch: {
          status: "active",
          funnel: {
            format: "multi-page",
            editorUrl: "/portal/agency/development/projects/aqua_site?panel=editor",
            repositoryUrl: "https://github.com/edstorm987/aquaoasis-web.com",
            productionUrl: "https://aquaoasis-web.com/systems-check",
            primaryGoal: "Booked consultations",
            primaryCta: "Book a review",
            conversionEvent: "consultation_booked",
            audienceNiche: "Independent dental practices",
            bookingDurationMinutes: 45,
            bookingCalendarUrl: "https://calendar.example.com/dental-review",
            bookingMeetingMode: "Google Meet",
            bookingConfirmation: "Your dental systems review is booked.",
            steps: [
              { id: "step_landing", name: "Landing page", path: "/systems-check", kind: "landing" },
              { id: "step_booking", name: "Book", path: "/systems-check/book", kind: "booking" },
              { id: "step_thanks", name: "Thank you", path: "/systems-check/thanks", kind: "thank-you" },
            ],
          },
        },
      }),
    }),
    ctx,
  );

  assert.equal(updateResponse.status, 200);
  const updatedBody = await updateResponse.json() as {
    asset: {
      id: string;
      status: string;
      funnel: {
        format: string;
        editorUrl: string;
        primaryCta: string;
        audienceNiche: string;
        bookingDurationMinutes: number;
        bookingCalendarUrl: string;
        steps: Array<{ kind: string }>;
      };
    };
  };
  assert.equal(updatedBody.asset.id, createdBody.asset.id);
  assert.equal(updatedBody.asset.status, "active");
  assert.equal(updatedBody.asset.funnel.format, "multi-page");
  assert.equal(updatedBody.asset.funnel.editorUrl, "/portal/agency/development/projects/aqua_site?panel=editor");
  assert.equal(updatedBody.asset.funnel.primaryCta, "Book a review");
  assert.equal(updatedBody.asset.funnel.audienceNiche, "Independent dental practices");
  assert.equal(updatedBody.asset.funnel.bookingDurationMinutes, 45);
  assert.equal(updatedBody.asset.funnel.bookingCalendarUrl, "https://calendar.example.com/dental-review");
  assert.deepEqual(updatedBody.asset.funnel.steps.map(step => step.kind), ["landing", "booking", "thank-you"]);

  const listResponse = await listMarketingAssetsHandler(
    new Request("http://localhost/assets?kind=funnel"),
    ctx,
  );
  assert.equal(listResponse.status, 200);
  const listedBody = await listResponse.json() as {
    assets: Array<{ id: string; funnel?: { conversionEvent?: string; editorUrl?: string } }>;
  };
  assert.equal(listedBody.assets.length, 1);
  assert.equal(listedBody.assets[0]?.id, createdBody.asset.id);
  assert.equal(listedBody.assets[0]?.funnel?.conversionEvent, "consultation_booked");
  assert.equal(listedBody.assets[0]?.funnel?.editorUrl, "/portal/agency/development/projects/aqua_site?panel=editor");
});
