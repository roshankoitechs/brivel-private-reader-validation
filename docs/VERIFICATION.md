# Verification record

Date: 9 November 2026. Author: Roshan / `roshankoitechs`.

## Environment

- Node 22.23.4; Next.js 16.4.5; React 19.3.1; Supabase JS 2.119.0.
- Supabase CLI 3.0.0; local PostgreSQL 17.11, Auth 2.197.0, Storage API 1.88.0, PostgREST 16.5.
- Actual local Docker services; no customer/cloud project or real transactions.

## Automated checks

| Check                                                                          | Observed result   |
| ------------------------------------------------------------------------------ | ----------------- |
| Endpoint pipeline tests                                                        | 18 passed         |
| Configuration key/URL tests                                                    | 7 passed          |
| Actual PostgreSQL RLS and grant tests (PGlite)                                 | 11 passed         |
| Full local Supabase HTTP integration                                           | 18 passed         |
| TypeScript strict check, including the generated standalone submission handler | Passed            |
| Next.js optimized production build                                             | Passed            |
| npm dependency audit (including dev dependencies)                              | 0 vulnerabilities |

The 18 integration checks cover the buyer's manifest, exact signed JWT lifetime (`exp - iat = 120`), real PNG retrieval without cookies, guest and forged-token denial, another user's chapter, unpurchased chapters, direct unauthorized Storage signing, public URL denial, purchase/mapping write denial, pending/refunded/revoked purchases, the documented post-revocation validity of an existing URL, tampering, and **actual expiry rejection after waiting for the URL's expiry timestamp plus 3 seconds**. Disposable users, chapters and objects were removed afterward.

RLS tests additionally verify exact object mappings (including unmapped objects inside a purchased chapter folder), empty JWT subject, anonymous table privileges, and resilience to an accidentally broad permissive Storage SELECT policy.

## Browser review

- Desktop and 390px / 320px mobile layouts reviewed in Chrome.
- No horizontal overflow at either mobile width; three sample images loaded with alt text.
- Supabase password sign-in opened the real private PNG chapter through the server endpoint.
- Preview and private reading are explicitly distinguished.
- Native dialog uses browser focus containment, labeled fields and a named dialog; Escape/close returns to reading.
- Reader width, chapter preview selection and return-to-preview flow checked.

## What this does not verify

No production cloud deployment, payment gateway, underwriting, uploader or checkout was exercised; they are outside the requested validation. The full HTTP suite is reproducible locally and is not part of the short GitHub CI job. GitHub CI runs tests, TypeScript, the production build and dependency audit. Signed URLs are access control, not DRM, and the 120-second route lifetime is not a global cap on an authorized buyer's direct Storage signing requests.
