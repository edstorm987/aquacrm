# External Assistant API

Milesymedia exposes a model-independent, read-only API under `/api/v1`.
It is intended for a Custom GPT Action, a Codex/Claude skill, or another
trusted assistant. The model never receives database credentials and cannot
change portal records.

## Configure

Generate a private token:

```bash
openssl rand -hex 32
```

Set these server-side values locally and in the production host:

```dotenv
MILESYMEDIA_ASSISTANT_API_TOKEN=<generated-token>
MILESYMEDIA_ASSISTANT_AGENCY_ID=milesymedia
```

Restart the portal after changing local environment variables. Never use a
`NEXT_PUBLIC_` prefix and never commit the real token.

## Connect an assistant

Use the deployed schema URL:

```text
https://<your-domain>/api/v1/openapi.json
```

Configure HTTP bearer authentication with the exact value of
`MILESYMEDIA_ASSISTANT_API_TOKEN`. For a file-based skill, use
`assistant-integrations/milesymedia-api/SKILL.md`.

## Endpoints

- `GET /api/v1/assistant/context` returns modules, counts, capabilities, and
  important attention items.
- `GET /api/v1/records?module=clients` lists one module with cursor pagination.
- `GET /api/v1/records/{id}?module=clients` returns one record.
- `POST /api/v1/search` searches across selected modules.
- `GET /api/v1/export?module=finance&format=json` downloads one module.
- `GET /api/v1/export?format=csv` downloads all accessible records.

Example:

```bash
curl \
  -H "Authorization: Bearer $MILESYMEDIA_API_TOKEN" \
  "https://<your-domain>/api/v1/assistant/context"
```

The gateway is fixed to one configured agency, rate-limited, served with
`no-store`, and sanitises secret-like fields and stored file bodies before
returning data. Rotate the token immediately if it is ever shared accidentally.

## Writes

The first release is intentionally read-only. Future write operations should
use separate scopes and require a preview, explicit human approval, validation,
and an audit record before changing business data.
