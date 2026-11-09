# Brivel · private chapter reader

A focused answer to Nathalie’s Supabase Storage / Next.js practical validation, with a small editorial reader to make the flow reviewable.

**Start with [`SUBMISSION.md`](SUBMISSION.md)** for the client-facing explanation and complete SQL + server code. The reader is an additional demonstration, not an implementation of the complete platform.

This public repository contains the complete application, database migration, original artwork, fixture scripts and tests. Anyone can review or clone the source without a GitHub invitation. The hosted demo can also be reviewed without a GitHub account.

## Contents

- [Hosted validation](#hosted-validation)
- [What is implemented](#what-is-implemented)
- [Architecture and code reuse](#architecture-and-code-reuse)
- [Security boundaries](#security-boundaries)
- [Run the reader](#run-the-reader)
- [Reproduce the full private flow locally](#reproduce-the-full-private-flow-locally)
- [Environment configuration](#environment-configuration)
- [Configure a hosted Supabase project](#configure-a-hosted-supabase-project)
- [Endpoint](#endpoint)
- [Tests and verification](#tests-and-verification)
- [Manual browser checks](#manual-browser-checks)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

## Hosted validation

- Live reader: https://brivel-reader-validation.vercel.app
- Client code submission (unlisted GitHub Gist): https://gist.github.com/roshankoitechs/89bb88f102463f6aabd2907e718f82d3
- Click **Open private chapter**. Purchased reader: `reader@brivel.test`, password `Brivel-Demo-2026!`.
- Negative case: `visitor@brivel.test`, same demo password; authentication succeeds but chapter access is denied.

These are disposable demonstration identities with synthetic artwork. The demo has no checkout or registration. Only the Supabase URL, publishable key and chapter UUID are configured on Vercel. Administrative fixture credentials are not deployed. The deployed Node major is pinned to 22, matching local verification and CI.

See [`docs/DELIVERY.md`](docs/DELIVERY.md) for the sharing links and final browser/cloud verification.

## What is implemented

- Next.js App Router Route Handler; TypeScript in strict mode; generated database types.
- A private `comic-panels` bucket and explicit PostgreSQL RLS on purchases, chapters, panel metadata and Storage objects.
- Authentication verified with `auth.getUser(token)`. Each request has its own publishable-key client with the same user bearer token for PostgREST and Storage. No service-role key in the application.
- Paid, non-revoked chapter purchase required. Refunded, disputed, pending and revoked purchases do not grant access. No browser writes to purchases or panel mappings.
- Exact database mapping between each chapter and its objects. Knowing a folder name does not grant access to other files in that folder.
- Batch URLs signed for **exactly 120 seconds**, ordered panel metadata, fail-closed error handling, bounded chapter size and non-cacheable responses.
- Responsive reader, accessible native sign-in dialog, width control and public preview. Private images use ordinary `<img>` elements so an image optimizer does not turn expiring private images into persistent public derivatives.

No checkout, payment integration, creator dashboard, paid content, real customer data or outgoing email is included. All sample illustrations are original vector assets made for this demonstration. Local private fixtures deliberately reuse these public illustrations so no proprietary art is needed for review.

## Architecture and code reuse

The browser signs in with Supabase Auth and sends its access token to the Next.js endpoint. The endpoint verifies that identity, reads the entitled chapter through PostgreSQL RLS, and signs the exact mapped Storage objects under the same user identity. The browser then loads the original images from the returned short-lived URLs.

| Location | Responsibility |
| --- | --- |
| [`src/app/api/chapters/[chapterId]/panels/route.ts`](src/app/api/chapters/%5BchapterId%5D/panels/route.ts) | HTTP entry point, request-scoped Supabase client and upstream deadlines |
| [`src/lib/panel-pipeline.ts`](src/lib/panel-pipeline.ts) | Identity verification, entitled panel lookup and 120-second signing |
| [`src/lib/panel-contract.ts`](src/lib/panel-contract.ts) | Shared manifest types and client-side response validation |
| [`src/lib/database.types.ts`](src/lib/database.types.ts) | Database types used by the Supabase clients |
| [`src/hooks/use-private-chapter.ts`](src/hooks/use-private-chapter.ts) | Auth transitions, cancellation, private reader state and URL renewal |
| [`src/components/sign-in-dialog.tsx`](src/components/sign-in-dialog.tsx) | Sign-in fields, errors and native dialog behavior |
| [`src/components/reader.tsx`](src/components/reader.tsx) | Reader presentation and chapter navigation |
| [`supabase/migrations/202611090001_private_reader.sql`](supabase/migrations/202611090001_private_reader.sql) | Tables, grants, entitlement function, private bucket and RLS policies |
| [`tests/`](tests/) | Automated pipeline, configuration, database, lifecycle, view and HTTP contract checks |
| [`scripts/`](scripts/) | Local fixtures, HTTP integration tests and canonical submission generation |

Public story fixtures live in `src/lib/sample-story.ts`, separately from the reader's auth and network state. Shared manifest types and database types keep the server and client contracts aligned.

`npm run submission` derives the standalone **JavaScript** handler from the TypeScript source using the TypeScript parser/compiler. It does not maintain a second implementation. Every `npm test` checks that the committed submission is current and runs the same HTTP contract against source and generated handlers.

The validation intentionally supports chapters with at most 50 panels, each with a unique object mapping. Changing this bound or building paginated loading is a separate reader requirement, not an anti-piracy feature.

## Security boundaries

A signed URL is a bearer capability. Anyone holding it can retrieve the object until it expires. RLS is checked when the URL is issued, **not on every subsequent signed download**. Revocation stops new URLs but does not cancel an already-issued URL. Expiry also does not erase downloaded or already-rendered images. A screenshot or saved copy remains possible. This implementation therefore does not promise “complete prevention of network-tab piracy.”

The authenticated client can also call Supabase directly, which is why access must be enforced in RLS rather than only in Next.js. An authorized buyer could directly request a different URL lifetime from Storage. The required Next.js pipeline always uses 120 seconds; this is not a project-wide maximum enforced against an authorized malicious buyer. If that additional requirement is needed, use a server-only signing architecture behind a carefully scoped entitlement RPC and prevent client signing; that is a different access model from this user-JWT/RLS validation.

For a real launch: create purchases only after a verified, idempotent server-to-server payment callback; configure per-user request limits at the deployment layer; keep objects private; upload with `cacheControl: '0'`; use HTTPS; audit existing policies before applying to a nonempty project. This migration targets a **fresh project**. Restrictive Storage policies protect this bucket even if another permissive Storage SELECT policy is later added, but policy changes by project administrators remain a trusted boundary.

## Run the reader

Prerequisites: Git, npm and **Node 22, version 22.22.2 or later in that major** (see `.nvmrc`). Dependencies are locked. Docker Desktop is needed only for the full local Supabase flow and HTTP integration suite.

```sh
git clone https://github.com/roshankoitechs/brivel-private-reader-validation.git
cd brivel-private-reader-validation
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Without configuration, the public sample works and the sign-in dialog explains setup.

Run commands below from the repository root. If using nvm, run `nvm install` and `nvm use` before `npm ci`.

## Reproduce the full private flow locally

Docker Desktop must be running. The pinned Supabase CLI is a dev dependency. It downloads the local stack on first start; no Supabase cloud project or billing account is needed.

```sh
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
npm run seed:local
npm run dev
```

`seed:local` is loopback-only. It creates a local test reader, inserts a paid purchase, uploads PNG panels into the private bucket and writes **only public configuration** into ignored `.env.local`. Service-role credentials are obtained transiently from the local CLI for fixture administration and are never written into the application.

The seed command replaces `.env.local` with local settings. Keep any separate hosted-project settings outside that file before running it. Start or restart Next.js after seeding so it picks up the local configuration.

Click **Open private chapter** and sign in with:

- Email: `reader@brivel.test`
- Password: `Brivel-Local-Only-2026!`

These are disposable local fixture credentials, not a cloud account. The `.test` domain receives no email. Returning to the preview clears the local Supabase session.

Stop the owned local stack when finished with `npx supabase stop`.

## Environment configuration

The reader uses exactly three application settings, documented in [`.env.example`](.env.example):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL; local setup uses `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key, or the local stack's anonymous key |
| `NEXT_PUBLIC_CHAPTER_ID` | UUID of the private chapter opened by the reader |

These values are public configuration, not administrative credentials. Authorization is enforced by the verified user identity and RLS. Never place a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable or the reading application.

Local seeding writes these settings automatically. For a manually configured project, copy `.env.example` to `.env.local` and replace its placeholder values. Next.js exposes the `NEXT_PUBLIC_*` settings at build time: restart development after changes, or rebuild and redeploy a production app. `.env.local`, temporary work files and Vercel local state are ignored by Git.

## Configure a hosted Supabase project

1. Review and apply the migration in `supabase/migrations/202611090001_private_reader.sql` to a **fresh** project.
2. Copy `.env.example` to `.env.local`; set the project's URL, **publishable** key and target chapter UUID. Never substitute a secret/service-role key.
3. Use a trusted administrative process to create a chapter, upload private PNG/JPEG/WebP assets with `cacheControl: '0'`, and insert the exact `chapter_panels` mapping and an authentic paid purchase for a test user.
4. Create/sign in with that test user. No signup or checkout is supplied in this task.
5. Run `npm run build && npm start`, or deploy the same repository to a standard Next.js host with those public environment values present at build time.

Do not run local fixture scripts against a hosted project. They intentionally refuse non-loopback destinations.

## Endpoint

```http
POST /api/chapters/{chapter-uuid}/panels
Authorization: Bearer <supabase-user-access-token>
```

No request body, user ID, object path, bucket, price or expiry is accepted from the caller. It returns the ordered image manifest, `expiresIn: 120`, and a conservative `refreshAfter` hint. Storage's signed token remains the authority for expiration.

- `200`: signed manifest.
- `400`: invalid chapter UUID.
- `401`: missing/invalid identity (including anonymous Auth users).
- `404`: missing chapter or no valid entitlement, deliberately indistinguishable.
- `503`: upstream, configuration or partial signing failure; no partial URLs or provider details leaked.

The reader reauthorizes on demand when a lazily loaded private image fails after a conservative local refresh deadline. It supports successive expirations, coalesces simultaneous failures, ignores stale responses after navigation, and stops automatic retries if a newly issued image immediately fails. It does not continuously renew URLs in the background. Already-loaded images may remain visible after expiry. Refresh failure clears private panels and asks the reader to sign in again.

## Tests and verification

### Automated checks without Docker

```sh
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

`npm test` first checks that `SUBMISSION.md` matches the canonical source, then runs 58 tests. It does not need a running app, cloud account or local Supabase stack.

| Suite | Coverage | Tests |
| --- | --- | --- |
| `tests/pipeline.test.ts` | Identity, chapter entitlement, signing and failure responses | 22 |
| `tests/config.test.ts` | Public configuration and rejection of unsafe key/URL settings | 7 |
| `tests/rls.test.ts` | Actual PostgreSQL RLS policies and grants through PGlite | 11 |
| `tests/reader-session.test.ts` | Auth transitions, cancellation, expiry renewal and stale requests | 11 |
| `tests/reader-view.test.ts` | Transition from sample presentation to purchased chapter | 1 |
| `tests/route-contract.test.ts` | The same HTTP contract for source and generated standalone handlers | 6 |

PGlite tests execute the actual migration with minimal Supabase-owned schema fixtures. They validate PostgreSQL permissions and RLS. HTTP contract tests use the real Supabase SDK with controlled upstream HTTP responses; they do not replace the full integration suite.

For development, `npm run test:watch` runs Vitest in watch mode. To focus on a suite, use, for example, `npm test -- tests/rls.test.ts`.

### Full HTTP integration against local Supabase

Start Docker Desktop and stop any previously started Next.js process. In **terminal 1**, prepare the local database and run an optimized production server:

```sh
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
npm run seed:local
npm run build
npm start
```

Wait until Next.js reports that it is ready at `http://127.0.0.1:3000`. In **terminal 2**, from the same repository:

```sh
npm run test:integration
```

The suite performs 23 checks against **real Supabase Auth, PostgreSQL, PostgREST, Storage and the running Next.js endpoint**. It verifies:

- Buyer access, ordered panel metadata and non-cacheable manifests.
- Original 2400px-wide PNG dimensions and byte-for-byte SHA-256 equality.
- Exactly 120 seconds in every signed token, followed by actual rejection after expiry.
- Guest, forged identity, other user and unpurchased chapter denial.
- Denial of direct unauthorized Storage signing and public object downloads.
- Rejection of purchase/mapping writes and caller-supplied user/path/expiry overrides.
- Pending, refunded, disputed and revoked purchase denial.
- Continued validity of an already-issued URL until expiry after revocation.
- Token tampering, cross-chapter token reuse and failure of the entire batch if a panel is missing.

The test takes a little over two minutes because it waits for real URL expiry; that pause is expected. It creates isolated disposable users, chapters, purchases and objects and cleans its fixtures in `finally`. It leaves the separately seeded manual demo reader available. Both the administrative fixture helper and the integration target refuse non-loopback destinations.

If port 3000 is occupied, start the app with `npm start -- --port 3001` and run `LOCAL_APP_URL=http://127.0.0.1:3001 npm run test:integration` in terminal 2. The app must still be configured for the same local Supabase stack.

After testing, stop the Next.js process with Ctrl+C and run:

```sh
npx supabase stop
```

### Continuous integration and recorded results

[GitHub Actions](https://github.com/roshankoitechs/brivel-private-reader-validation/actions) runs `npm ci`, the 58 automated tests, strict TypeScript checking, the production build and the dependency audit on pushes and pull requests. The Docker-based HTTP integration suite is run separately using the instructions above.

The validation recorded on **9 November 2026** passed all 58 automated tests, all 23 local HTTP checks and nine additional hosted HTTPS smoke checks, including actual signed URL expiry. The hosted checks are recorded verification results, not an additional committed test command. Desktop and 390px / 320px browser checks also passed. The dependency audit reported zero vulnerabilities at that time.

See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for the detailed evidence and environment.

## Manual browser checks

Use the hosted demo credentials above or the local seeded reader credentials for the relevant environment.

1. Open the public sample. Select each preview chapter, use **Next chapter**, open/close the edition notes, toggle reader width and use **Back to top**. The final sample chapter must have **Next chapter** disabled.
2. Open the sign-in dialog. Empty fields must trigger required-field validation; an incorrect password must show a clear error. Escape or **Close sign in** must close the dialog and return focus to the opener.
3. Sign in as the purchased reader. The page must show **Private chapter** / **Purchased chapter**, and all three PNG panels must load when scrolled into view. Private chapter labels must not retain the previously selected sample chapter.
4. Select **Return to preview**. Private panels and the local session must be cleared. In the hosted demo, sign in as `visitor@brivel.test`; the expected result is **Chapter unavailable or access not granted.**
5. Check 390px and 320px viewport widths. Text, chapter controls and images must remain usable without horizontal page overflow.
6. For expiry, use the integration suite above. An image already loaded by the browser can remain visible after expiry; this is expected. A new request using an expired URL must fail. If an unloaded private image encounters an expired URL, the reader reauthorizes on demand and retries with a new manifest.

The preview chapters intentionally reuse the same original sample artwork. Private fixtures also use this artwork so reviewers can test the pipeline without proprietary assets.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `npm ci` reports an unsupported Node version | Use Node 22.22.2 or newer within major 22, then rerun installation. |
| Private reading reports missing configuration | Seed locally or fill the three public settings in `.env.local`; restart Next.js or rebuild production. |
| Local seed/integration cannot reach Supabase | Start Docker Desktop and the local stack from the repository root; inspect `npx supabase status`. |
| Integration cannot reach Next.js | Keep terminal 1 running and match its port with `LOCAL_APP_URL`. |
| Local sign-in rejects the demo credentials | Run `npm run seed:local` again, restart the app, and use the **local** password rather than the hosted demo password. |
| An authenticated user receives 404 for a chapter | Check that the target UUID exists and the user has a paid, non-revoked purchase for that exact chapter. |
| The endpoint returns 503 | Check configuration, upstream availability, object existence and exact panel mappings. The endpoint intentionally omits internal provider errors and partial URLs. |
| Tests report a stale generated submission | Run `npm run submission`, review the generated diff and rerun `npm test`. |

## Further documentation

- [`SUBMISSION.md`](SUBMISSION.md): complete SQL and standalone JavaScript route in the requested raw-code format.
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md): requirement-by-requirement audit and the exact security guarantees.
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md): observed test results, browser checks and hosted verification.
- [`docs/DELIVERY.md`](docs/DELIVERY.md): client links and account management links.
- [`docs/CLIENT-REPLY.md`](docs/CLIENT-REPLY.md): ready-to-send English client note. Nothing has been sent to the client.

To regenerate the submission after changing the migration or server pipeline, run `npm run submission`. The generator compiles the standalone handler from the canonical TypeScript source; edit that source rather than maintaining a separate implementation in the Markdown file.
