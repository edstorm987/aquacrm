# Zimante Group Brand Architecture

## Public sites

| Identity | Local URL | Public role |
| --- | --- | --- |
| Zimante Group | `http://localhost:3033` | Group enquiries, partnerships, combined work and group tools |
| Milesymedia | `http://localhost:3030` | Commercial and personal photography and video |
| Central portal | `http://localhost:3032` | CRM, fulfilment, finance, support and client portals |
| AquaOasis-Web | `http://localhost:3034` | Websites, Google Business Profile and local visibility |
| Software Studio | `http://localhost:3035` | Portals, ecommerce, automation and operational software |

The specialist sites are separate repositories and deployments. The Milesymedia
portal remains the private operating system and central system of record.

## Shared enquiry contract

Specialist sites submit `POST http://localhost:3032/api/public/brand-enquiry`
to the portal in local development.

```json
{
  "brand": "milesymedia",
  "services": ["Business & events"],
  "name": "Example person",
  "email": "person@example.com",
  "phone": "",
  "contactMethod": "email",
  "message": "A short brief",
  "sourceUrl": "https://milesymedia.com/",
  "campaign": "spring-launch",
  "consent": true,
  "website": ""
}
```

`brand` accepts `zimante-group`, `milesymedia`, `aquaoasis-web` or
`software-studio`. `website` is the honeypot field and must remain blank.

Production origins must be listed in `PUBLIC_BRAND_ORIGINS`. Localhost origins
are accepted automatically outside production.

## Record ownership

- One contact/lead history is retained when the same email crosses brands.
- `companyId` identifies the primary trading company for the current record.
- `companyIds`, `brandSlugs` and `serviceLines` retain cross-brand context.
- Commercial packs carry brand, legal entity, product and company attribution.
- Invoices inherit the company attribution from the commercial pack.
- Lead conversion carries the trading company into the client record.
- Existing company-scoped products, legal documents, development projects and
  reporting remain the source of specialist separation.

## Public integrity

- Milesymedia category galleries must only use authentic work with permission.
- Software evidence may use copied project screenshots, never by editing the
  source project.
- Results and testimonials must not be invented.
- `Software Studio` is a working name.
- Zimante names, domains, legal disclosures and trademarks require final checks
  before public launch or asset purchasing.
