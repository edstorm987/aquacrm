"use client";

// The module's setup surface — the controls that were missing.
//
// Everything here drives routes that already existed and that nothing called:
// PATCH `provider`, POST/PATCH `identities`, POST `identities/verify`, POST
// `test`. The page it replaces rendered the same data as a read-only report,
// so a fresh install could be looked at but never configured: there was no
// field anywhere in the product for the Postmark key, and the Settings-hub
// panel's provider/webhook controls wrote to `install.config`, which the
// sending path does not read.
//
// Two honesty rules this screen keeps:
//   • credentials are WRITE-ONLY. The API returns a masked tail and nothing
//     else, so a blank box means "leave the stored one alone", never "clear
//     it" — the same rule `writePluginSettings` uses for vault fields.
//   • an outcome is reported as the server reported it. Verification that the
//     provider refused shows the provider's reason; a test send that did not
//     leave shows the delivery failure. Neither is redrawn as success.

import { useCallback, useState } from "react";
import type {
  ProviderKind,
  PublicProviderConfig,
  SenderIdentity,
} from "../lib/domain";
import { isoDateTimeValue } from "../lib/safeDate";

const BASE = "/api/portal/email-sender";

const PROVIDER_OPTIONS: { value: ProviderKind; label: string }[] = [
  { value: "none", label: "None — queue mail, send nothing" },
  { value: "postmark", label: "Postmark" },
  { value: "smtp", label: "SMTP" },
  { value: "sendgrid", label: "SendGrid (no driver yet)" },
  { value: "resend", label: "Resend (no driver yet)" },
];

interface Outcome {
  ok: boolean;
  message: string;
}

async function call(path: string, init: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const response = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: response.ok && body?.ok === true, body: body ?? {} };
}

/** The server's own words, never a generic "something went wrong". */
function serverMessage(body: Record<string, unknown>, fallback: string): string {
  const candidate = body.error ?? body.reason;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : fallback;
}

export default function SettingsClient(props: {
  provider: PublicProviderConfig;
  identities: SenderIdentity[];
  webhookUrl: string;
}) {
  const [provider, setProvider] = useState<ProviderKind>(props.provider.provider);
  const [apiKey, setApiKey] = useState("");
  const [accountToken, setAccountToken] = useState("");
  // Write-only, like the two tokens. The stored value is never sent to the
  // browser — it signs delivery callbacks, and anyone holding it can forge a
  // "delivered" event — so this box starts blank and blank means "keep it".
  const [webhookSecret, setWebhookSecret] = useState("");
  const [smtpHost, setSmtpHost] = useState(props.provider.smtp?.host ?? "");
  const [smtpPort, setSmtpPort] = useState(String(props.provider.smtp?.port ?? 587));
  const [smtpUser, setSmtpUser] = useState(props.provider.smtp?.user ?? "");
  const [smtpSecure, setSmtpSecure] = useState<"tls" | "starttls" | "none">(
    props.provider.smtp?.secure ?? "starttls",
  );

  const [identityName, setIdentityName] = useState("");
  const [identityEmail, setIdentityEmail] = useState("");
  const [testTo, setTestTo] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [providerOutcome, setProviderOutcome] = useState<Outcome | null>(null);
  const [identityOutcome, setIdentityOutcome] = useState<Outcome | null>(null);
  const [testOutcome, setTestOutcome] = useState<Outcome | null>(null);

  const reload = useCallback(() => {
    // The provider row and every identity row are server-rendered above, so a
    // refresh is how the screen re-reads them. Deliberately not a local
    // optimistic patch: the statuses here are claims about a remote system.
    window.location.reload();
  }, []);

  const saveProvider = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("provider");
    setProviderOutcome(null);
    const payload: Record<string, unknown> = { provider };
    // Blank means "keep what is stored" — the value can never be displayed
    // back, so treating blank as a clear would silently delete a working key.
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    if (accountToken.trim()) payload.accountToken = accountToken.trim();
    if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();
    if (provider === "smtp") {
      payload.smtp = {
        host: smtpHost.trim(),
        port: Number(smtpPort) || 587,
        user: smtpUser.trim(),
        secure: smtpSecure,
      };
    }
    const { ok, body } = await call("provider", { method: "PATCH", body: JSON.stringify(payload) });
    setBusy(null);
    if (!ok) {
      setProviderOutcome({ ok: false, message: serverMessage(body, "The provider could not be saved.") });
      return;
    }
    setApiKey("");
    setAccountToken("");
    setWebhookSecret("");
    setProviderOutcome({
      ok: true,
      message: "Saved. Readiness is reset until a send actually succeeds — run a test below.",
    });
    reload();
  }, [provider, apiKey, accountToken, webhookSecret, smtpHost, smtpPort, smtpUser, smtpSecure, reload]);

  const addIdentity = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("identity");
    setIdentityOutcome(null);
    const { ok, body } = await call("identities", {
      method: "POST",
      body: JSON.stringify({
        name: identityName.trim(),
        email: identityEmail.trim(),
        isDefault: props.identities.length === 0,
      }),
    });
    setBusy(null);
    if (!ok) {
      setIdentityOutcome({ ok: false, message: serverMessage(body, "The identity could not be created.") });
      return;
    }
    setIdentityName("");
    setIdentityEmail("");
    reload();
  }, [identityName, identityEmail, props.identities.length, reload]);

  const verifyIdentity = useCallback(async (id: string) => {
    setBusy(`verify:${id}`);
    setIdentityOutcome(null);
    const { ok, body } = await call("identities/verify", { method: "POST", body: JSON.stringify({ id }) });
    setBusy(null);
    if (!ok) {
      setIdentityOutcome({ ok: false, message: serverMessage(body, "The provider did not confirm this address.") });
      return;
    }
    const evidence = typeof body.evidence === "string" ? body.evidence : "The provider confirmed this address.";
    setIdentityOutcome({ ok: true, message: evidence });
    reload();
  }, [reload]);

  const makeDefault = useCallback(async (id: string) => {
    setBusy(`default:${id}`);
    setIdentityOutcome(null);
    const { ok, body } = await call("identities", {
      method: "PATCH",
      body: JSON.stringify({ id, patch: { isDefault: true } }),
    });
    setBusy(null);
    if (!ok) {
      setIdentityOutcome({ ok: false, message: serverMessage(body, "The default could not be changed.") });
      return;
    }
    reload();
  }, [reload]);

  const sendTest = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("test");
    setTestOutcome(null);
    const { ok, body } = await call("test", { method: "POST", body: JSON.stringify({ to: testTo.trim() }) });
    setBusy(null);
    if (!ok) {
      // The queued row survives a refusal, and saying so is the difference
      // between "nothing happened" and "it is waiting for a fixed provider".
      const detail = typeof body.messageId === "string"
        ? " The message stays in the outbox and can be retried."
        : "";
      setTestOutcome({ ok: false, message: serverMessage(body, "The test send did not leave.") + detail });
      return;
    }
    const ref = typeof body.externalRef === "string" ? ` Provider reference ${body.externalRef}.` : "";
    setTestOutcome({ ok: true, message: `The provider accepted the message.${ref}` });
    reload();
  }, [testTo, reload]);

  return (
    <div className="email-sender-settings-form">
      <section>
        <h2>Provider</h2>
        <p className="email-sender-meta">
          Status: <strong>{props.provider.status}</strong>
          {props.provider.errorMessage ? ` — ${props.provider.errorMessage}` : ""}
          {" · "}
          Last successful send:{" "}
          {props.provider.testedAt
            ? isoDateTimeValue(props.provider.testedAt) ?? "Date needs review"
            : "never"}
        </p>
        <form onSubmit={saveProvider}>
          <label>
            <span>Provider</span>
            <select
              value={provider}
              onChange={event => setProvider(event.target.value as ProviderKind)}
            >
              {PROVIDER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>{provider === "smtp" ? "SMTP password" : "API key"}</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={
                props.provider.apiKeyMasked
                  ? `stored — ends …${props.provider.apiKeyMasked}. Leave blank to keep it.`
                  : "not set"
              }
              onChange={event => setApiKey(event.target.value)}
            />
          </label>

          <label>
            <span>Postmark account token</span>
            <input
              type="password"
              value={accountToken}
              autoComplete="off"
              placeholder={
                props.provider.accountTokenMasked
                  ? `stored — ends …${props.provider.accountTokenMasked}. Leave blank to keep it.`
                  : "not set"
              }
              onChange={event => setAccountToken(event.target.value)}
            />
            <small>
              Account-level token, different from the server send token. Postmark&rsquo;s sender-signature
              API needs it, so without it a sender address cannot be confirmed here.
            </small>
          </label>

          <label>
            <span>Webhook secret</span>
            <input
              type="password"
              value={webhookSecret}
              autoComplete="off"
              placeholder={
                props.provider.webhookSecretMasked
                  ? `stored — ends …${props.provider.webhookSecretMasked}. Leave blank to keep it.`
                  : "not set — provider events will be rejected"
              }
              onChange={event => setWebhookSecret(event.target.value)}
            />
            <small>
              Paste the same value into the provider&rsquo;s webhook URL as <code>?secret=…</code>.
              Events arriving without it are rejected. It is never shown back here, because it is
              what proves an event really came from the provider. Webhook URL:{" "}
              <code>{props.webhookUrl}</code>
            </small>
          </label>

          {provider === "smtp" ? (
            <>
              <label>
                <span>SMTP host</span>
                <input type="text" value={smtpHost} onChange={event => setSmtpHost(event.target.value)} />
              </label>
              <label>
                <span>SMTP port</span>
                <input type="text" inputMode="numeric" value={smtpPort} onChange={event => setSmtpPort(event.target.value)} />
              </label>
              <label>
                <span>SMTP username</span>
                <input type="text" value={smtpUser} onChange={event => setSmtpUser(event.target.value)} />
              </label>
              <label>
                <span>Transport security</span>
                <select value={smtpSecure} onChange={event => setSmtpSecure(event.target.value as "tls" | "starttls" | "none")}>
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="tls">Implicit TLS (465)</option>
                  <option value="none">None — test only</option>
                </select>
              </label>
            </>
          ) : null}

          <button type="submit" disabled={busy === "provider"}>
            {busy === "provider" ? "Saving…" : "Save provider"}
          </button>
        </form>
        {providerOutcome ? (
          <p className={providerOutcome.ok ? "email-sender-ok" : "email-sender-error"} role="status">
            {providerOutcome.message}
          </p>
        ) : null}
      </section>

      <section>
        <h2>Sender identities</h2>
        <p className="email-sender-meta">
          An identity becomes <strong>active</strong> only when the configured provider confirms the
          address. Until then it stays <strong>pending</strong> and the reason is shown beside it.
        </p>
        {props.identities.length === 0 ? (
          <p className="email-sender-empty">No sender identities yet.</p>
        ) : (
          <table className="email-sender-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Status</th><th>Default</th>
                <th>Verified</th><th>Evidence / reason</th><th></th>
              </tr>
            </thead>
            <tbody>
              {props.identities.map(identity => (
                <tr key={identity.id}>
                  <td>{identity.name}</td>
                  <td>{identity.email}</td>
                  <td>{identity.status}</td>
                  <td>{identity.isDefault ? "yes" : "—"}</td>
                  <td>
                    {identity.verifiedAt
                      ? isoDateTimeValue(identity.verifiedAt) ?? "Date needs review"
                      : "—"}
                  </td>
                  <td>
                    {/* An identity that was confirmed once keeps its status
                        through a failed RE-check, so both facts have to show:
                        printing only "confirmed by …" would hide a provider
                        that has just said no, which is the newer evidence. */}
                    {identity.status === "active" && identity.verificationSource
                      ? identity.verificationError
                        ? `confirmed by ${identity.verificationSource}, but the last re-check failed: ${identity.verificationError}`
                        : `confirmed by ${identity.verificationSource}`
                      : identity.verificationError
                        ? identity.verificationError
                        : "not checked yet"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => verifyIdentity(identity.id)}
                      disabled={busy === `verify:${identity.id}`}
                    >
                      {busy === `verify:${identity.id}` ? "Checking…" : "Verify with provider"}
                    </button>
                    {identity.isDefault ? null : (
                      <button
                        type="button"
                        onClick={() => makeDefault(identity.id)}
                        disabled={busy === `default:${identity.id}`}
                      >
                        Make default
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form onSubmit={addIdentity}>
          <label>
            <span>Name</span>
            <input type="text" value={identityName} onChange={event => setIdentityName(event.target.value)} required />
          </label>
          <label>
            <span>Email</span>
            <input type="email" value={identityEmail} onChange={event => setIdentityEmail(event.target.value)} required />
          </label>
          <button type="submit" disabled={busy === "identity"}>
            {busy === "identity" ? "Adding…" : "Add identity"}
          </button>
        </form>
        {identityOutcome ? (
          <p className={identityOutcome.ok ? "email-sender-ok" : "email-sender-error"} role="status">
            {identityOutcome.message}
          </p>
        ) : null}
      </section>

      <section>
        <h2>Test send</h2>
        <form onSubmit={sendTest}>
          <label>
            <span>Send a test to</span>
            <input type="email" value={testTo} onChange={event => setTestTo(event.target.value)} required />
          </label>
          <button type="submit" disabled={busy === "test"}>
            {busy === "test" ? "Sending…" : "Send test"}
          </button>
        </form>
        {testOutcome ? (
          <p className={testOutcome.ok ? "email-sender-ok" : "email-sender-error"} role="status">
            {testOutcome.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
