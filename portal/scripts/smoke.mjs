#!/usr/bin/env node
// Standalone Milesymedia portal smoke.
//
// Exercises the current product path:
//   1. health check
//   2. real sign-in as Ed/founder
//   3. agency + clients routes
//   4. one canonical create-client call with starter portal enabled
//   5. created client overview, Systems tab, and portal tab
//
// Usage:
//   AQUA_BASE=http://localhost:3030 node scripts/smoke.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.AQUA_BASE || "http://localhost:3030";
const FOUNDER_LOGIN = process.env.FOUNDER_LOGIN || "Ed";
const FOUNDER_PASSWORD = process.env.FOUNDER_PASSWORD || "AquaSmokePass123!";
const JAR = join(tmpdir(), `milesymedia-portal-smoke-${process.pid}.json`);

const failures = [];
let total = 0;

function record(label, ok, detail = "") {
  total += 1;
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function loadCookies() {
  try { return JSON.parse(await readFile(JAR, "utf8")); }
  catch { return {}; }
}

async function saveCookies(jar) {
  await mkdir(dirname(JAR), { recursive: true }).catch(() => {});
  await writeFile(JAR, JSON.stringify(jar));
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

function captureSetCookie(res, jar) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}

async function go(method, path, opts = {}) {
  const jar = await loadCookies();
  const headers = { ...(opts.headers ?? {}) };
  const cookie = cookieHeader(jar);
  if (cookie) headers.cookie = cookie;
  if (opts.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
  });
  captureSetCookie(res, jar);
  await saveCookies(jar);
  return res;
}

async function text(res) {
  return res.status < 500 ? await res.text().catch(() => "") : "";
}

function visibleHtml(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

async function main() {
  console.log(`Unified Milesymedia smoke against ${BASE}\n`);

  console.log("§ Health");
  let res = await go("GET", "/healthz");
  let body = await text(res);
  record("healthz 200", res.status === 200, `status=${res.status}`);
  record("healthz ok", body.includes('"ok":true'));

  res = await go("GET", "/healthz/full");
  const fullHealth = res.status < 500 ? await res.json().catch(() => null) : null;
  record("deep health 200 in local development", res.status === 200, `status=${res.status}`);
  record("deep health reports production readiness honestly", typeof fullHealth?.readyForProduction === "boolean");
  record(
    "deep health exposes safe service statuses",
    Array.isArray(fullHealth?.readiness)
      && fullHealth.readiness.every(item => typeof item?.id === "string" && typeof item?.required === "boolean"),
  );

  console.log("\n§ Founder sign-in");
  res = await go("POST", "/api/auth/login", {
    body: { email: FOUNDER_LOGIN, password: FOUNDER_PASSWORD },
  });
  const loginJson = res.status < 300 ? await res.json().catch(() => null) : null;
  record("founder login 200", res.status === 200, `status=${res.status}`);
  record("founder login redirects to portal", typeof loginJson?.redirect === "string" && loginJson.redirect.startsWith("/portal"));

  console.log("\n§ Agency shell");
  res = await go("GET", "/portal/agency");
  body = await text(res);
  let visible = visibleHtml(body);
  record("agency dashboard 200", res.status === 200, `status=${res.status}`);
  record("agency dashboard has one New client action", (visible.match(/New client/g) ?? []).length === 1);
  record("agency dashboard uses Systems language", body.includes("Systems") && !/Plugin marketplace|Capabilities/.test(body));

  res = await go("GET", "/portal/clients");
  body = await text(res);
  visible = visibleHtml(body);
  record("clients list 200", res.status === 200, `status=${res.status}`);
  record("clients list has one New client action", (visible.match(/<button[^>]*>[\s\S]*?New client[\s\S]*?<\/button>/g) ?? []).length === 1);

  console.log("\n§ Create client + starter portal");
  const suffix = Date.now().toString(36);
  res = await go("POST", "/api/portal/fulfillment/clients", {
    body: {
      name: `Smoke Client ${suffix}`,
      slug: `smoke-client-${suffix}`,
      ownerEmail: `smoke-client-${suffix}@example.com`,
      createPortal: true,
      stage: "aqua-epic-intro",
      brand: { primaryColor: "#0EA5A4" },
      metadata: {
        contactName: "Smoke",
        businessName: `Smoke Client ${suffix}`,
        planTier: "foundational",
      },
      starterPortal: {
        enabled: true,
        phase: "Epic Intro",
        planTier: "Foundational Flow",
        contactName: "Smoke",
        businessName: `Smoke Client ${suffix}`,
        onboardingStartedAt: new Date().toISOString().slice(0, 10),
      },
    },
  });
  const created = res.status < 300 ? await res.json().catch(() => null) : null;
  const clientId = created?.client?.id;
  record("create client 200/201", res.status === 200 || res.status === 201, `status=${res.status}`);
  record("create client returns id", typeof clientId === "string");
  record("create client returns starter portal", created?.portalSetup?.ok === true);
  record("create client returns built-in customer portal", created?.portalSetup?.variantId === "milesymedia-customer-home-v2");

  if (clientId) {
    console.log("\n§ Created client workspace");
    const checks = [
      ["overview", `/portal/clients/${clientId}`],
      ["website tab", `/portal/clients/${clientId}?tab=website`],
      ["portal tab", `/portal/clients/${clientId}?tab=portal`],
      ["finance tab", `/portal/clients/${clientId}?tab=finance`],
      ["files tab", `/portal/clients/${clientId}?tab=files`],
      ["systems tab", `/portal/clients/${clientId}?tab=systems`],
      ["legacy tools tab compatibility", `/portal/clients/${clientId}?tab=tools`],
      ["settings", `/portal/clients/${clientId}/settings`],
    ];
    for (const [label, path] of checks) {
      const page = await go("GET", path);
      const pageText = await text(page);
      record(`${label} 200`, page.status === 200, `status=${page.status}`);
      if (path.includes("tab=portal")) {
        record("portal tab embeds the live customer preview", pageText.includes(`/client-preview/${clientId}?embedded=1`));
        record("portal tab uses the create-review-invite workflow", pageText.includes("Create") && pageText.includes("Review") && pageText.includes("Invite"));
      }
      if (path.includes("tab=systems") || path.includes("tab=tools")) {
        record(`${label} shows Systems`, pageText.includes("Systems") && pageText.includes("Client operations") && !/Capabilities|Add capability|tools added|Plugin marketplace/.test(pageText));
      }
    }

    console.log("\n§ Milesymedia site connection");
    const telemetryResponse = await go("GET", `/api/tenants/client-telemetry?clientId=${encodeURIComponent(clientId)}`);
    const telemetryJson = telemetryResponse.status < 300 ? await telemetryResponse.json().catch(() => null) : null;
    const siteKey = telemetryJson?.telemetry?.siteKey;
    record("client telemetry connection 200", telemetryResponse.status === 200, `status=${telemetryResponse.status}`);
    record("new client has a site key", typeof siteKey === "string" && siteKey.startsWith("msy_"));

    const tagResponse = await go("GET", "/milesy-tag.js");
    const tagSource = await text(tagResponse);
    record("embeddable Milesymedia tag 200", tagResponse.status === 200, `status=${tagResponse.status}`);
    record("tag captures page views and browser errors", tagSource.includes('send("pageview"') && tagSource.includes('send("error"'));

    if (siteKey) {
      const propertyResponse = await go("POST", "/api/tenants/client-properties", {
        body: {
          clientId,
          action: "add",
          property: {
            label: "Smoke website",
            kind: "website",
            status: "review",
            previewUrl: "https://smoke-client.example.com",
            tagStatus: "planned",
          },
        },
      });
      const propertyJson = propertyResponse.status < 300 ? await propertyResponse.json().catch(() => null) : null;
      const propertyId = propertyJson?.property?.id;
      record("website can be registered for monitoring", propertyResponse.status === 200 && typeof propertyId === "string");

      const collectResponse = await go("POST", "/api/telemetry/collect", {
        body: {
          siteKey,
          type: "heartbeat",
          propertyId,
          message: "Runtime smoke connection",
          url: "https://smoke-client.example.com/?private=removed",
          occurredAt: Date.now(),
        },
      });
      record("site signal accepted", collectResponse.status === 202, `status=${collectResponse.status}`);

      const refreshedResponse = await go("GET", `/api/tenants/client-telemetry?clientId=${encodeURIComponent(clientId)}`);
      const refreshedJson = refreshedResponse.status < 300 ? await refreshedResponse.json().catch(() => null) : null;
      const firstEvent = refreshedJson?.telemetry?.events?.[0];
      record("signal appears in client Systems", firstEvent?.type === "heartbeat" && firstEvent?.message === "Runtime smoke connection");
      record("collected URLs remove query strings", firstEvent?.url === "https://smoke-client.example.com/");

      if (propertyId) {
        const afterHeartbeat = await go("POST", "/api/tenants/client-properties", {
          body: {
            clientId,
            action: "update",
            property: { id: propertyId, label: "Smoke website" },
          },
        });
        const afterHeartbeatJson = afterHeartbeat.status < 300 ? await afterHeartbeat.json().catch(() => null) : null;
        record("manual test does not claim tag installation", afterHeartbeatJson?.property?.tagStatus === "planned");

        const pageviewResponse = await go("POST", "/api/telemetry/collect", {
          body: {
            siteKey,
            propertyId,
            type: "pageview",
            path: "/",
            title: "Smoke website",
            url: "https://smoke-client.example.com/?private=removed",
            occurredAt: Date.now(),
          },
        });
        record("real website page view accepted", pageviewResponse.status === 202, `status=${pageviewResponse.status}`);

        const afterPageview = await go("POST", "/api/tenants/client-properties", {
          body: {
            clientId,
            action: "update",
            property: { id: propertyId, label: "Smoke website" },
          },
        });
        const afterPageviewJson = afterPageview.status < 300 ? await afterPageview.json().catch(() => null) : null;
        record("real website signal marks tag installed", afterPageviewJson?.property?.tagStatus === "installed");
      }
    }

    console.log("\n§ Client-specific support");
    const unsafeBillingResponse = await go("POST", "/api/tenants/customer-portal-control", {
      body: {
        clientId,
        action: "save",
        billingUrl: "javascript:alert(1)",
      },
    });
    record("unsafe payment links are rejected", unsafeBillingResponse.status === 400, `status=${unsafeBillingResponse.status}`);

    const portalSettings = {
      clientId,
      action: "save",
      mode: "onboarding",
      loginEmail: `smoke-client-${suffix}@example.com`,
      contactName: "Smoke",
      servicePlan: "Foundational Flow",
      planSummary: "A complete website build with a calm launch and ongoing care.",
      planIncludes: "Website design and build\nLaunch support\nOngoing monitoring",
      billingCadence: "Monthly",
      welcomeNote: "Welcome to your project.",
      supportEmail: "support-smoke@example.com",
      supportPhone: "+44 20 7946 0000",
      supportWhatsappUrl: "https://wa.me/447700900321",
      logoUrl: "https://example.com/smoke-client-logo.png",
      accentColor: "#7a2331",
      billingUrl: "https://example.com/secure-payment",
    };
    const supportResponse = await go("POST", "/api/tenants/customer-portal-control", {
      body: portalSettings,
    });
    record("client support settings save", supportResponse.status === 200, `status=${supportResponse.status}`);

    const supportPreview = await go("GET", `/client-preview/${clientId}?section=support`);
    const supportPreviewText = await text(supportPreview);
    record("customer support preview 200", supportPreview.status === 200, `status=${supportPreview.status}`);
    record("customer support shows client-specific email and phone",
      supportPreviewText.includes("mailto:support-smoke@example.com")
      && supportPreviewText.includes("tel:+442079460000"));
    record("customer support shows client-specific WhatsApp",
      supportPreviewText.includes("https://wa.me/447700900321"));
    record("customer portal shows client identity",
      supportPreviewText.includes("https://example.com/smoke-client-logo.png")
      && supportPreviewText.includes("Smoke Client"));
    record("customer portal applies the configured accent",
      supportPreviewText.includes("--portal-accent") && supportPreviewText.includes("#7a2331"));
    record("agency preview keeps customer support controls read-only",
      supportPreviewText.includes("Customer can send this") && supportPreviewText.includes("disabled"));

    const ticketResponse = await go("POST", "/api/tenants/client-requests", {
      body: {
        clientId,
        type: "support-ticket",
        message: "Please confirm the launch checklist.",
      },
    });
    const ticketJson = ticketResponse.status < 300 ? await ticketResponse.json().catch(() => null) : null;
    const ticketId = ticketJson?.request?.id;
    record("a client support conversation can be opened", ticketResponse.status === 200 && typeof ticketId === "string");

    const replyResponse = ticketId
      ? await go("PATCH", "/api/tenants/client-requests", {
          body: {
            clientId,
            requestId: ticketId,
            reply: "We have it. The final launch review is now in progress.",
          },
        })
      : null;
    record("Milesymedia can reply inside the support conversation", replyResponse?.status === 200, `status=${replyResponse?.status ?? "not-run"}`);

    const repliedSupportPreview = await go("GET", `/client-preview/${clientId}?section=support`);
    const repliedSupportText = await text(repliedSupportPreview);
    record("the customer portal shows the Milesymedia reply",
      repliedSupportPreview.status === 200
      && repliedSupportText.includes("We have it. The final launch review is now in progress.")
      && repliedSupportText.includes("Milesymedia"));

    const lifecycleChecks = [
      ["onboarding", "We are laying the foundations.", "Tell us anything we should know."],
      ["designing", "Your direction is taking shape.", "Leave focused design feedback."],
      ["developed-launch", "The build is becoming real.", "Send a build note or launch question."],
      ["maintenance", "Your digital home is live.", "Ask for a change or report an issue."],
    ];
    for (const [mode, heading, responsePrompt] of lifecycleChecks) {
      const modeResponse = await go("POST", "/api/tenants/customer-portal-control", {
        body: { ...portalSettings, mode },
      });
      const modePreview = await go("GET", `/client-preview/${clientId}`);
      const modePreviewText = await text(modePreview);
      record(
        `${mode} lifecycle view persists`,
        modeResponse.status === 200 && modePreview.status === 200 && modePreviewText.includes(heading),
      );
      const projectPreview = await go("GET", `/client-preview/${clientId}?section=project`);
      const projectPreviewText = await text(projectPreview);
      record(
        `${mode} gives the customer a stage-specific response`,
        projectPreview.status === 200
          && projectPreviewText.includes("Keep things moving.")
          && projectPreviewText.includes(responsePrompt)
          && projectPreviewText.includes("Customer can send this"),
      );
    }
    await go("POST", "/api/tenants/customer-portal-control", {
      body: portalSettings,
    });

    console.log("\n§ Customer billing journey");
    const invoiceCreate = await go("POST", "/api/portal/agency-finance/invoices", {
      body: {
        clientId,
        issuedAt: Date.now(),
        dueAt: Date.now() + 14 * 86_400_000,
        lineItems: [{ description: "Smoke website build", quantity: 1, unitCents: 125000 }],
        taxCents: 0,
        currency: "gbp",
      },
    });
    const invoiceCreateJson = invoiceCreate.status < 300
      ? await invoiceCreate.json().catch(() => null)
      : null;
    const invoiceId = invoiceCreateJson?.invoice?.id;
    record("agency can create a client invoice", invoiceCreate.status === 201 && typeof invoiceId === "string", `status=${invoiceCreate.status}`);

    const invoiceSend = invoiceId
      ? await go("PATCH", "/api/portal/agency-finance/invoices", {
          body: { id: invoiceId, patch: { status: "sent" } },
        })
      : null;
    record("agency can issue the client invoice", invoiceSend?.status === 200, `status=${invoiceSend?.status ?? "not-run"}`);

    const billingPreview = await go("GET", `/client-preview/${clientId}?section=billing`);
    const billingPreviewText = await text(billingPreview);
    record("issued invoice appears with secure payment action",
      billingPreview.status === 200
      && billingPreviewText.includes("Smoke website build")
      && billingPreviewText.includes("https://example.com/secure-payment")
      && billingPreviewText.includes(">Pay<"));
    record("customer billing explains the plan and what is included",
      billingPreviewText.includes("A complete website build with a calm launch and ongoing care.")
      && billingPreviewText.includes("Website design and build")
      && billingPreviewText.includes("Ongoing monitoring")
      && billingPreviewText.includes("Monthly")
      && billingPreviewText.includes("Project deposit"));

    const invoicePaid = invoiceId
      ? await go("POST", "/api/portal/agency-finance/invoices/mark-paid", {
          body: { id: invoiceId, paidVia: "manual" },
        })
      : null;
    record("agency can record invoice payment", invoicePaid?.status === 200, `status=${invoicePaid?.status ?? "not-run"}`);

    const paidBillingPreview = await go("GET", `/client-preview/${clientId}?section=billing`);
    const paidBillingText = await text(paidBillingPreview);
    record("paid invoice returns customer balance to zero",
      paidBillingPreview.status === 200
      && paidBillingText.includes("paid")
      && paidBillingText.includes("£0.00"));

    const polishedHome = await go("GET", `/client-preview/${clientId}`);
    const polishedHomeText = await text(polishedHome);
    record("customer project log uses polished payment language",
      polishedHome.status === 200
      && polishedHomeText.includes("Payment received for")
      && !polishedHomeText.includes("Recorded payment for invoice"));
    record("customer project log does not expose staff email addresses",
      !polishedHomeText.includes("edwardhallam07@gmail.com"));

    console.log("\n§ Customer contributions");
    const contributionResponse = await go("POST", "/api/tenants/client-files", {
      body: {
        clientId,
        action: "add",
        file: {
          name: "Customer inspiration",
          url: "https://example.com/customer-inspiration",
          category: "inspiration",
        },
      },
    });
    const contributionJson = contributionResponse.status < 300
      ? await contributionResponse.json().catch(() => null)
      : null;
    record("project inspiration link can be added", contributionResponse.status === 200);

    const unsafeContribution = await go("POST", "/api/tenants/client-files", {
      body: {
        clientId,
        action: "add",
        file: {
          name: "Unsafe link",
          url: "javascript:alert(1)",
          category: "inspiration",
        },
      },
    });
    record("unsafe project links are rejected", unsafeContribution.status === 400, `status=${unsafeContribution.status}`);

    const filesPreview = await go("GET", `/client-preview/${clientId}?section=files`);
    const filesPreviewText = await text(filesPreview);
    record("customer contribution appears in portal files",
      filesPreview.status === 200 && filesPreviewText.includes("Customer inspiration"));

    const recordingResponse = await go("POST", "/api/tenants/client-files", {
      body: {
        clientId,
        action: "add",
        file: {
          name: "Discovery call recording",
          url: "https://example.com/discovery-call.mp4",
          category: "recording",
        },
      },
    });
    const recordingJson = recordingResponse.status < 300
      ? await recordingResponse.json().catch(() => null)
      : null;
    record("call recording can be attached to the customer record", recordingResponse.status === 200);

    const customerRecord = await go("GET", `/client-preview/${clientId}?section=resources`);
    const customerRecordText = await text(customerRecord);
    record("customer transparency record renders",
      customerRecord.status === 200
      && customerRecordText.includes("Your complete Milesymedia record.")
      && customerRecordText.includes("What we hold.")
      && customerRecordText.includes("Notes we hold about your project."));
    record("customer can revisit recordings and personal account data",
      customerRecordText.includes("Discovery call recording")
      && customerRecordText.includes("Rewatch")
      && customerRecordText.includes(portalSettings.loginEmail)
      && customerRecordText.includes("Foundational Flow"));
    record("customer navigation exposes their record",
      customerRecordText.includes("Your record"));

    const activityInbox = await go("GET", "/portal/agency/activity-inbox");
    const activityInboxText = await text(activityInbox);
    record("customer contribution reaches agency inbox",
      activityInbox.status === 200 && activityInboxText.includes("shared “Customer inspiration”"));

    if (contributionJson?.file?.id) {
      const removalResponse = await go("POST", "/api/tenants/client-files", {
        body: { clientId, action: "delete", fileId: contributionJson.file.id },
      });
      record("project contribution can be removed", removalResponse.status === 200);
    } else {
      record("project contribution can be removed", false);
    }
    if (recordingJson?.file?.id) {
      await go("POST", "/api/tenants/client-files", {
        body: { clientId, action: "delete", fileId: recordingJson.file.id },
      });
    }

    const preview = await go("GET", `/client-preview/${clientId}`);
    const previewText = await text(preview);
    record("agency live customer preview 200", preview.status === 200, `status=${preview.status}`);
    record("new client starts with the polished portal", previewText.includes("Everything, beautifully in one place."));
    record("new client portal carries its service plan", previewText.includes("Foundational Flow"));
  }

  console.log(`\n${failures.length ? "✗" : "✓"} ${total - failures.length}/${total} checks passed`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(` - ${f}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
