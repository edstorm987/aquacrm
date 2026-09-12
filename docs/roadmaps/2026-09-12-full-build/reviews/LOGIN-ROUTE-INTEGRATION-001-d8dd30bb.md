# Login and route integration independent review

- Exact SHA: `d8dd30bbdddf47b7d9ecf7a1fdfb683faecf9cf8`
- Verdict: **REJECT**
- Combined findings: P0 0 / P1 2 / P2 2
- Reviewer made no source edits or external/live actions; final tree was clean.

## Findings

1. **P1, candidate-attributable:** global `SkipToContent` prevents native
   fragment navigation then focuses `#main-content`, but only the three auth
   mains became programmatically focusable. At least 15 existing roots remain
   non-focusable. A keyboard probe on `/milesymedia` changed the hash and
   scrolled while focus stayed on `BODY`.
2. **P1, inherited integration acceptance:** `clientId` is dropped through
   showcase login to `/login/live`, preventing exact client-audience recovery
   for shared-email users.
3. **P2, inherited integration acceptance:** main login resolves dynamic tenant
   brands, but forgot/reset use static brand lookup. Recovery presentation can
   therefore fall back or accept the wrong requested brand even when the exact
   subject/client is selected.
4. **P2, inherited integration acceptance:** OAuth initiation/state/callback
   preserve only return URL, not validated tenant/client intent; error redirects
   are unbranded and success selects the primary agency rather than the requested
   authorised membership. MFA enforcement itself remains intact.

## Green evidence

- Exact expected ten-file delta and accepted route inventory; 165 routes.
- Focused login/route 27/27 and bot challenge 27/27.
- Supplied Chromium matrix 54/54 and independent 18 route/viewport scans with
  zero serious/critical axe findings, browser errors or external requests.
- Dynamic CAPTCHA resize and reduced-motion behavior passed.
- Diff check clean.
- TypeScript's one error is unchanged base drift in the SEC subject-access
  import; not candidate-attributable, but the combined tree is not compile-green.

External gates remain real Turnstile/OAuth, Safari/Firefox and screen reader,
full CI/build after SEC correction, and deployed headers/origins.
