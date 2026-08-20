# `src/lib/enquiries/formCapture.ts`

← [File index](../../../../files-index.md) · Area: Shared logic — src/lib/

**What it is:** What a website form actually contained, kept as submitted. The old contract accepted twelve fixed keys — name, email, phone, contact method, services, message — and silently dropped everything else. A form asking for budget, company size or how somebody heard about you lost those answers on arrival, and every submission looked identical in the inbox: no form name, no page beyond "/", no way to tell a hero form from a careers form from a chatbot. Worse, `contactMethod` was mandatory. A chatbot or careers form that never asked "how would you like to be contacted?" could not submit at all unless the website invented an answer — so the inbox showed a preference the person never expressed. Aqua now records what was asked and says so plainly when something was not. What the form was for. Decides where it routes; never what the inbox shows.

## Exports (9)

- `FORM_PURPOSES`
- `type FormPurpose`
- `isFormPurpose(value: unknown): value is FormPurpose`
- `interface CapturedField (4 members)`
- `interface FormIdentity (5 members)`
- `derivePurpose(input: { declared?: string; fields?: CapturedField[]; formName?: string; pagePath?: string; }): { purpose: FormPurpose; purposeSource: FormIdentity["purposeSource"] }`
- `describeForm(identity: FormIdentity): string`
- `isCoreField(key: string): boolean`
- `additionalFields(fields: CapturedField[]): CapturedField[]`

## Used by (2)

- [`scripts/smoke-form-capture.test.ts`](../../../scripts/smoke-form-capture.test.md)
- [`src/app/api/public/form-capture/route.ts`](../../app/api/public/form-capture/route.md)

