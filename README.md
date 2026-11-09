# Brivel · private chapter reader

A focused answer to Nathalie’s Supabase Storage / Next.js practical validation, with a small editorial reader to make the flow reviewable.

**Start with [`SUBMISSION.md`](SUBMISSION.md)** for the client-facing explanation and complete SQL + server code. The reader is an additional demonstration, not an implementation of the complete platform.

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

## Code boundaries and reuse

- The Route Handler owns configuration, the request-scoped Supabase client and bounded upstream fetches. `panel-pipeline.ts` owns the authentication / RLS / signing response flow.
- `panel-contract.ts` supplies the shared response types and validates the HTTP manifest before rendering. Generated database types cover the database query without a hand-cast row result.
- `use-private-chapter.ts` owns request cancellation, serial auth transitions, URL renewal and sign-out. `sign-in-dialog.tsx` owns fields and native dialog behavior. `reader.tsx` composes the presentation; public fixtures live in `sample-story.ts`.
- `npm run submission` derives the standalone **JavaScript** handler from the TypeScript source using the TypeScript parser/compiler. It does not maintain a second implementation. Every `npm test` checks that the committed submission is current and runs the same HTTP contract against source and generated handlers.

The validation intentionally supports chapters with at most 50 panels, each with a unique object mapping. Changing this bound or building paginated loading is a separate reader requirement, not an anti-piracy feature.

## Security boundaries

A signed URL is a bearer capability. Anyone holding it can retrieve the object until it expires. RLS is checked when the URL is issued, **not on every subsequent signed download**. Revocation stops new URLs but does not cancel an already-issued URL. Expiry also does not erase downloaded or already-rendered images. A screenshot or saved copy remains possible. This implementation therefore does not promise “complete prevention of network-tab piracy.”

The authenticated client can also call Supabase directly, which is why access must be enforced in RLS rather than only in Next.js. An authorized buyer could directly request a different URL lifetime from Storage. The required Next.js pipeline always uses 120 seconds; this is not a project-wide maximum enforced against an authorized malicious buyer. If that additional requirement is needed, use a server-only signing architecture behind a carefully scoped entitlement RPC and prevent client signing; that is a different access model from this user-JWT/RLS validation.

For a real launch: create purchases only after a verified, idempotent server-to-server payment callback; configure per-user request limits at the deployment layer; keep objects private; upload with `cacheControl: '0'`; use HTTPS; audit existing policies before applying to a nonempty project. This migration targets a **fresh project**. Restrictive Storage policies protect this bucket even if another permissive Storage SELECT policy is later added, but policy changes by project administrators remain a trusted boundary.

## Run the reader

Prerequisite: **Node 22, version 22.22.2 or later in that major** (see `.nvmrc`). Dependencies are locked.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. Without configuration, the public sample works and the sign-in dialog explains setup.

## Reproduce the full private flow locally

Docker Desktop must be running. The pinned Supabase CLI is a dev dependency. It downloads the local stack on first start; no Supabase cloud project or billing account is needed.

```sh
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
npm run seed:local
npm run dev
```

`seed:local` is loopback-only. It creates a local test reader, inserts a paid purchase, uploads PNG panels into the private bucket and writes **only public configuration** into ignored `.env.local`. Service-role credentials are obtained transiently from the local CLI for fixture administration and are never written into the application.

Click **Open private chapter** and sign in with:

- Email: `reader@brivel.test`
- Password: `Brivel-Local-Only-2026!`

These are disposable local fixture credentials, not a cloud account. The `.test` domain receives no email. Returning to the preview clears the local Supabase session.

Stop the owned local stack when finished with `npx supabase stop`.

## Configure an existing hosted Supabase project

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

## Verification

```sh
npm run test        # Endpoint unit tests + actual PostgreSQL RLS using PGlite
npm run typecheck
npm run build
npm audit
```

With the local stack and the app running:

```sh
npm run test:integration
```

Integration tests exercise **real Supabase Auth, PostgreSQL, PostgREST, Storage and the Next.js endpoint**. They create isolated disposable users and chapters, verify allow/deny behavior and actual PNG downloads, check the token's `exp - iat === 120`, then wait for the actual URL to expire and check that Storage rejects it. The test takes a little over two minutes and cleans its fixtures in `finally`.

PGlite tests run the actual migration with minimal Supabase-owned schema fixtures. They validate PostgreSQL permissions and RLS, not a mocked access function. HTTP integration tests cover the real Storage service separately.

See [`docs/VERIFICATION.md`](docs/VERIFICATION.md) for the observed results and [`docs/CLIENT-REPLY.md`](docs/CLIENT-REPLY.md) for the ready-to-send note. Nothing has been sent to the client.

The requirement-by-requirement result, including the unachievable absolute anti-extraction wording, is in [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md).
