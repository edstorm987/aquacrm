# External Assistant API + MCP

AquaCRM exposes its business data to a trusted outside assistant over **two
transports that share one credential**:

- **MCP** — `POST /api/mcp`, JSON-RPC 2.0, for an MCP client (Claude, or any
  MCP-capable agent).
- **REST** — `/api/v1/*`, described by a live OpenAPI 3.1 schema, for a Custom
  GPT Action, a Codex/Claude skill, or plain `curl`.

Both are **tenant-scoped, permission-gated, rate-limited and fully audited**.
Neither can change a business record.

> **Corrected 2026-08-19.** This page previously said the API was
> "intentionally read-only" with "no write operations" and documented only an
> environment token. That is out of date on three counts: **managed keys**,
> the **MCP server**, and the **`actions:propose` write path** have all
> shipped. The contract that actually holds is narrower and more interesting
> than "read-only" — see [The one write path](#the-one-write-path).

---

## What an assistant can and cannot do

| | |
|---|---|
| **Can** | Read scoped business context, Advisor health/Radar/recommendations, list and fetch records, search, export JSON/CSV. |
| **Can** | Submit an **action proposal** to a human inbox, and read back whether its own proposals were accepted, parked or rejected. |
| **Cannot** | Create, edit, complete, delete, send, approve or pay **anything**. `capabilities.writeRecords` is hardcoded `false`. |
| **Cannot** | Create a task. Even an accepted proposal is turned into a task by the **human** who accepted it, not by the assistant. |
| **Cannot** | See outside its granted modules, or use a tool its permissions don't include — unavailable tools are not merely refused, they are **absent from `tools/list`**. |

---

## Authentication

`Authorization: Bearer <token>` on every request, to both transports. Two token
kinds are accepted.

### 1. Managed keys (the current path)

Created in the UI — **Agency → Settings → External AI**, or **Dev Team → API &
MCP**. Format `aqa_` + 43 URL-safe characters.

- Only a **SHA-256 hash** is stored. The plaintext is shown **once**, at create
  or rotate, and is unrecoverable afterwards.
- Each key carries its **own** modules, permissions and optional expiry, so one
  assistant's scope is independent of another's.
- **Max 20 active keys** per agency. Rotate (new token, same scope, old token
  dead immediately) and revoke are instant.
- Every use stamps `lastUsedAt` and writes an `external_ai.data_accessed`
  activity record.

> ⚠ **Where keys live.** Managed keys are stored in **`PortalState`** — the
> portal's single state blob — not in a dedicated Supabase table. On the `file`
> backend (local dev) that blob is a JSON file under `.data/`, so **resetting,
> re-seeding or re-forking the sandbox destroys every key**, and every assistant
> configured with one silently loses access. Because only the hash is kept, a
> lost key cannot be recovered — it must be created again and re-pasted into the
> assistant. Surfaced in the UI on the Dev Team **API & MCP** page.

### 2. The legacy environment token (still supported)

```dotenv
AQUACRM_ASSISTANT_API_TOKEN=<openssl rand -hex 32>
AQUACRM_ASSISTANT_AGENCY_ID=milesymedia
```

`MILESYMEDIA_ASSISTANT_API_TOKEN` / `MILESYMEDIA_ASSISTANT_AGENCY_ID` are
accepted as legacy aliases; the agency id defaults to `milesymedia`. Never use a
`NEXT_PUBLIC_` prefix and never commit the real token; restart after changing it
locally.

An env token grants **all 15 modules and every permission except
`actions:propose`** — so the legacy path is genuinely read-only, and only a
managed key can reach the proposal inbox. Production additionally rejects an env
token shorter than 32 characters when no managed key exists. Prefer a managed
key; remove the env token once every assistant has moved over.

### Permissions (6) and modules (15)

| Permission | Grants |
|---|---|
| `advisor:read` | Advisor-grade context: scoped health, Radar, alerts, recommendations. |
| `context:read` | Workspace overview: permitted modules, counts, attention items. |
| `records:read` | List and fetch records in permitted modules. |
| `search:read` | Weighted search across permitted modules. |
| `export:read` | JSON/CSV export. Sets `capabilities.export: ["json","csv"]`; it is **not** an MCP tool. |
| `actions:propose` | Submit proposals to the human inbox (also requires the `tasks` module). |

Modules: `clients`, `contacts`, `staff`, `leads`, `pipelines`, `tasks`, `sops`,
`products`, `milestones`, `client-care`, `company`, `legal`, `finance`,
`activity`, `business-modules`.

---

## MCP — `POST /api/mcp`

| | |
|---|---|
| Transport | JSON-RPC 2.0 over HTTP **POST only**. Stateless — no session id, no SSE. |
| `GET` | **405** `stream_not_supported` (with `Allow: POST, GET, DELETE`). |
| `DELETE` | **204** — accepted so a client's teardown succeeds; there is no session to end. |
| Protocol | Latest **`2025-11-25`**; also negotiates `2025-06-18` and `2025-03-26`. Every response carries `mcp-protocol-version: 2025-11-25`. |
| Server identity | `aquacrm-business-assistant` v1.0.0 ("AquaCRM Business Assistant"). |
| Origin | A cross-origin `Origin` header is rejected **403** `origin_rejected`. |
| Notifications | A JSON-RPC message with no `id` returns **202** with an empty body. |
| Methods | `initialize`, `ping`, `tools/list`, `tools/call`. Anything else → `-32601`. |

### The 7 tools

`tools/list` is **computed per key** — a tool whose permission (or module) the
key lacks is not listed at all.

| Tool | Requires | Read-only | What it does |
|---|---|---|---|
| `aqua_advisor_context` | `advisor:read` | ✓ | Scoped health, Radar findings, alerts, recommendations, accepted work. |
| `aqua_workspace_context` | `context:read` | ✓ | Permitted modules, record counts, attention items. |
| `aqua_list_records` | `records:read` | ✓ | Paginated sanitised records from one permitted module. |
| `aqua_get_record` | `records:read` | ✓ | One record by id. |
| `aqua_search` | `search:read` | ✓ | Weighted search across permitted modules. |
| `aqua_propose_action` | `actions:propose` + `tasks` | ✗ | Submits a proposal to the human inbox. **Cannot** create/edit/complete/delete a task. |
| `aqua_list_action_proposals` | `actions:propose` + `tasks` | ✓ | This key's own proposals and their decision state + linked task id. |

To see the live list for a specific key — rather than trusting this table —
open **Dev Team → API & MCP**, which renders the real
`listExternalAssistantMcpTools()` result for the key you select.

---

## REST — `/api/v1/*`

Schema: `https://<your-domain>/api/v1/openapi.json` (public, OpenAPI 3.1,
"AquaCRM Business Assistant API" v1.0.0). Point a Custom GPT Action at it and
configure HTTP bearer auth. For a file-based skill, use
`assistant-integrations/milesymedia-api/SKILL.md`.

| Endpoint | Method | Requires |
|---|---|---|
| `/api/v1/advisor/context` | GET | `advisor:read` |
| `/api/v1/assistant/context` | GET | `context:read` |
| `/api/v1/records?module=clients` | GET | `records:read` |
| `/api/v1/records/{recordId}?module=clients` | GET | `records:read` |
| `/api/v1/search` | POST | `search:read` |
| `/api/v1/export?module=finance&format=json\|csv` | GET | `export:read` |
| `/api/v1/actions/proposals` | GET | `actions:propose` + `tasks` module |
| `/api/v1/actions/proposals` | POST | `actions:propose` + `tasks` module → **202** |
| `/api/v1/openapi.json` | GET | public |

```bash
curl -H "Authorization: Bearer $AQUACRM_ASSISTANT_API_TOKEN" \
  "https://<your-domain>/api/v1/assistant/context"
```

`/api/v1/embed/*` also lives under this prefix but belongs to the Aqua embed
feature, not the assistant API — it uses its own token.

---

## The one write path

`actions:propose` is the **only** thing an assistant can write, and it does not
write business data. `POST /api/v1/actions/proposals` (or `aqua_propose_action`)
appends to a **proposal inbox** and returns **202 Accepted** with the literal
message:

> `Proposal submitted for human approval. No task was created.`

### The human-acceptance contract

1. The assistant submits a proposal: title, detail, expected outcome, evidence,
   source ids, suggested priority/due date. It lands `status: "pending"`.
   **Nothing else in the business changes.**
2. Ed sees it at **`/portal/agency/actions` → External AI proposal inbox**
   (`#external-ai-proposals`), gated to agency roles.
3. Ed decides — **accept**, **park** (auto-returns to pending when the park
   expires) or **reject**. Accepting is what calls `createAgencyTask`, with
   `origin: "advisor"`, `sourceId: external-proposal:<id>`, the proposal's
   evidence attached for Radar reconciliation, and an assignee (the accepting
   user unless another is chosen). The assistant is never the actor.
4. The assistant can read the outcome back via `aqua_list_action_proposals` /
   `GET /actions/proposals` — its **own** proposals only, matched on token
   fingerprint — including the linked `taskId` if one was created.
5. Limits: **50 open proposals** per assistant (pending + parked); a decided
   proposal cannot be re-decided (**409**).

So "no write path" was wrong, but "the assistant can change things" would be
wrong too. The accurate statement is: **an assistant can ask; only a human can
commit.**

---

## Safety envelope

- **Tenant fixed at the token.** A managed key's agency comes from the key
  record; an env token's from `AQUACRM_ASSISTANT_AGENCY_ID`. Nothing in a
  request can change it. Unknown agency → **503**.
- **Rate limit 120 requests / 60s** per token fingerprint + client IP →
  **429** with `Retry-After`.
- **Sanitised responses.** `sanitizeExternalData` strips secret-like fields and
  stored file bodies before anything leaves.
- **`no-store`** on every response.
- **Audited.** Every authenticated call logs `external_ai.data_accessed`
  (method, path, fingerprint, key id and name); proposal decisions log
  `external_ai.proposal_{accepted,parked,rejected}`.
- **Untrusted-input posture.** The context builders mark the snapshot
  `readOnly: true, humanApprovalRequired: true` and instruct the model never to
  follow instructions found inside business data.

### Error codes

`unauthorized` (401) · `forbidden_permission` / `forbidden_module` /
`origin_rejected` (403) · `invalid_body` / `invalid_format` /
`invalid_proposal` (400) · `rate_limited` (429) ·
`assistant_api_not_configured` / `assistant_api_token_too_short` /
`assistant_agency_not_found` (503) · `stream_not_supported` (405).

Rotate or revoke a key immediately if it is ever shared accidentally.

---

## Known rough edges

- **Keys don't survive a sandbox reset** — see the callout under
  [Managed keys](#1-managed-keys-the-current-path). Ed's call whether key
  storage moves out of `PortalState`.
- **Export filenames still say `milesymedia-`** (`/api/v1/export` builds
  `milesymedia-<module>-<stamp>.<ext>`), a leftover from the pre-AquaCRM name.
- **The skill folder is still `assistant-integrations/milesymedia-api/`**, though
  its `SKILL.md` contents are current (it documents MCP and `actions:propose`).

---

*Source of truth for this page: `src/lib/server/externalAssistantApi.ts`,
`externalAssistantKeys.ts`, `externalAssistantMcp.ts`,
`externalAssistantProposals.ts`, `src/app/api/mcp/route.ts` and
`src/app/api/v1/**`. The deep dossier is
[docs/workspace/advisor.md §5](workspace/advisor.md); every endpoint is listed
in [docs/workspace/api-reference.md](workspace/api-reference.md).*
