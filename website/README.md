# AquaCRM Website

Standalone product landing page for AquaCRM.

## Local development

```sh
./start-local.sh
```

Open `http://localhost:3035`.

The product sign-in routes to `https://aqua-crm.com/login?brand=aquacrm&next=/portal`
in production. Local development can still redirect to the local AquaCRM app on
port `3032` for testing.

## Supabase

The shared AquaCRM Supabase project is:

```text
dghzbsxbdatskserctgt
https://dghzbsxbdatskserctgt.supabase.co
```

From the repository root:

```sh
supabase login
supabase link --project-ref dghzbsxbdatskserctgt
supabase db push
```

Do not commit access tokens, database passwords, `.env.local`, or service role
keys. The `service_role` key must stay server-side only.
