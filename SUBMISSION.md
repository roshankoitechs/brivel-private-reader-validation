# Brivel — Supabase Private Storage & Next.js Signed URL Pipeline

Prepared by Roshan · 9 November 2026

## Scope and assumptions

This solution uses Next.js App Router and Supabase. A trusted, verified payment process has already created a paid purchase for a registered user. Every private panel has an exact chapter-to-object mapping. The migration targets a fresh project. Browser clients cannot create purchases, change mappings, or upload protected assets.

The server verifies the caller with Supabase Auth, then both PostgREST and Storage use the same user's JWT. RLS enforces paid, non-revoked chapter ownership at both layers. The signing call always uses exactly 120 seconds. The route accepts only a chapter UUID, never a caller-supplied user ID or object path.

## 1. Explicit PostgreSQL schema and RLS

Apply the following migration in Supabase:

```sql
-- Apply to a fresh Supabase project. Purchase writes belong to a trusted,
-- verified payment webhook, never to a browser or this read endpoint.
begin;

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 200)
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  status text not null check (status in ('pending','paid','refunded','disputed')),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index purchases_entitlement_idx on public.purchases(user_id, chapter_id)
  where status = 'paid' and revoked_at is null;

create table public.chapter_panels (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  position integer not null check (position between 1 and 50),
  bucket_id text not null default 'comic-panels' check (bucket_id = 'comic-panels'),
  object_path text not null check (length(object_path) between 1 and 500),
  alt_text text not null default '' check (length(alt_text) <= 1000),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 30000),
  unique(chapter_id, position),
  unique(bucket_id, object_path)
);

alter table public.chapters enable row level security;
alter table public.purchases enable row level security;
alter table public.chapter_panels enable row level security;
-- Explicit grants override Supabase's broad default table grants.
revoke all on public.chapters, public.purchases, public.chapter_panels from anon, authenticated;
grant select on public.chapters, public.purchases, public.chapter_panels to authenticated;
grant all on public.chapters, public.purchases, public.chapter_panels to service_role;

create policy "Read own active purchases" on public.purchases
for select to authenticated using (
  user_id = (select auth.uid()) and status = 'paid' and revoked_at is null
);
create policy "Read purchased chapters" on public.chapters
for select to authenticated using (
  exists (select 1 from public.purchases p where p.chapter_id = chapters.id)
);
create policy "Read purchased panel metadata" on public.chapter_panels
for select to authenticated using (
  exists (select 1 from public.purchases p where p.chapter_id = chapter_panels.chapter_id)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('comic-panels','comic-panels',false,20971520,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false,
  file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

-- Exact relational mapping: no trusting a client path, folder parsing or owner_id.
create policy "Purchased comic objects" on storage.objects
for select to authenticated using (
  bucket_id = 'comic-panels' and exists (
    select 1 from public.chapter_panels cp
    where cp.bucket_id = storage.objects.bucket_id and cp.object_path = storage.objects.name
  )
);
-- Restrictive policies AND with existing permissive policies. A future broad
-- SELECT policy for another bucket cannot accidentally expose these objects.
create policy "Comic objects require entitlement" on storage.objects
as restrictive for select to authenticated using (
  bucket_id <> 'comic-panels' or exists (
    select 1 from public.chapter_panels cp
    where cp.bucket_id = storage.objects.bucket_id and cp.object_path = storage.objects.name
  )
);
create policy "No anonymous comic objects" on storage.objects
as restrictive for select to anon using (bucket_id <> 'comic-panels');
-- No client INSERT/UPDATE/DELETE grants or policies on purchases/panels.
-- Uploading and verified purchase creation are intentionally outside this task.
commit;
```

## 2. Complete standalone Next.js Route Handler

Install `@supabase/supabase-js` and `server-only`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project URL and a publishable key (or legacy anon key). Never use a secret/service-role key for this pipeline.

Place the following complete code in `src/app/api/chapters/[chapterId]/panels/route.ts`. It is the standalone form of the tested implementation; the repository separates configuration and pipeline helpers and supplies generated database types for maintainability.

```ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Configuration guard, not token authentication. Supabase verifies credentials. */
function validPublicConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))
    )
      return false;
    if (key.startsWith('sb_publishable_')) return true;
    // Legacy anon JWTs are still supported, but never secret/service-role keys.
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}


const URL_TTL_SECONDS = 120;
const PRIVATE_BUCKET = 'comic-panels';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Authorization',
  'Referrer-Policy': 'no-referrer',
};
type Panel = {
  id: string;
  position: number;
  object_path: string;
  alt_text: string;
  width: number;
  height: number;
};
type SignedPanel = Omit<Panel, 'object_path'> & { url: string };
type PanelManifest = { panels: SignedPanel[]; expiresIn: 120; refreshAfter: string };
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

/** A new user-scoped Supabase client per request; NEVER pass a service client. */
async function panelPipeline(
  request: Request,
  chapterId: string,
  client: SupabaseClient,
) {
  if (!UUID.test(chapterId)) return json({ error: 'Invalid chapter ID.' }, 400);
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match || match[1].length > 8192)
    return json({ error: 'Sign in to read this chapter.' }, 401);
  try {
    // Verify with Auth; do not trust decoded JWTs or a client-supplied user ID.
    const { data: auth, error: authError } = await client.auth.getUser(match[1]);
    if (authError || !auth.user || auth.user.is_anonymous)
      return json({ error: 'Sign in to read this chapter.' }, 401);

    // RLS independently scopes both this query and the Storage signing call.
    const { data: rows, error: readError } = await client
      .from('chapter_panels')
      .select('id,position,object_path,alt_text,width,height')
      .eq('chapter_id', chapterId)
      .order('position')
      .limit(51);
    if (readError) return json({ error: 'Unable to load this chapter. Please retry.' }, 503);
    const panels = rows as Panel[] | null;
    // Same result for nonexistent, unpaid, refunded and revoked chapters.
    if (!panels?.length) return json({ error: 'Chapter unavailable or access not granted.' }, 404);
    if (panels.length > 50) return json({ error: 'Chapter configuration is invalid.' }, 503);
    const issuedAt = Date.now();
    const { data: signed, error: signError } = await client.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrls(
        panels.map((p) => p.object_path),
        URL_TTL_SECONDS,
      );
    if (
      signError ||
      !signed ||
      signed.length !== panels.length ||
      signed.some((s) => s.error || !s.signedUrl || !s.path)
    ) {
      return json({ error: 'Unable to prepare chapter images. Please retry.' }, 503);
    }
    const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    if (panels.some((p) => !byPath.has(p.object_path)))
      return json({ error: 'Unable to prepare chapter images. Please retry.' }, 503);
    return json({
      panels: panels.map(({ object_path, ...panel }) => ({
        ...panel,
        url: byPath.get(object_path)!,
      })),
      expiresIn: URL_TTL_SECONDS,
      // Conservative refresh hint, not a replacement for Storage's token expiry.
      refreshAfter: new Date(issuedAt + 105_000).toISOString(),
    });
  } catch {
    // Never log bearer tokens, paths, signed URLs or provider response bodies.
    return json({ error: 'Reading service is temporarily unavailable.' }, 503);
  }
}


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!validPublicConfig(url, key))
    return Response.json(
      { error: 'Reading service is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } },
    );
  // Publishable/anon key + the caller's bearer token keeps PostgREST AND Storage
  // under the same user's RLS. There is no secret/service-role key in this app.
  const client = createClient(url!, key!, {
    global: {
      headers: { Authorization: request.headers.get('authorization') ?? '' },
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return panelPipeline(request, (await context.params).chapterId, client);
}
```

## 3. Request

```http
POST /api/chapters/<chapter-uuid>/panels
Authorization: Bearer <supabase-user-access-token>
```

The response contains ordered panel IDs, dimensions, accessible alt text and signed URLs, plus `expiresIn: 120` and a conservative refresh hint. It is marked `private, no-store`. A denied/missing chapter returns the same 404 response; upstream failures return a generic 503 without partial URLs or provider details.

Use signed URLs directly in reader image elements. Do not serve private panels through a persistent public image-optimization cache. Upload with `cacheControl: '0'` and keep the bucket private.

## 4. Important protection boundary

A short-lived signed URL limits the period during which a private object can be requested. It cannot completely prevent network-tab extraction, screenshots or saving an already-delivered image. A holder can use the URL until it expires. Revoking a purchase stops new signatures but does not invalidate an existing signed URL before expiry.

The required Next.js pipeline issues URLs for exactly 120 seconds. Because authorized readers have RLS-controlled Storage SELECT access, they can also call Storage directly and choose another expiry. If a strict project-wide signing-lifetime cap against authorized malicious users is additionally required, direct client signing must be disabled and signing must move behind a separately scoped server-only authorization/signing boundary. This validation does not misrepresent endpoint TTL as such a global cap.

## 5. Verification

The repository includes endpoint tests, actual PostgreSQL RLS tests and full HTTP integration tests against local Supabase Auth, PostgREST, Storage and the Next.js server. Integration checks include buyer/stranger/guest access, forged tokens, pending/refunded/revoked purchases, direct signing attempts, public URL denial, purchase forgery denial, token lifetime, tampering, and an actual wait for expiry followed by a rejected download. See `docs/VERIFICATION.md` for observed results.

Official references: [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [private asset delivery](https://supabase.com/docs/guides/storage/serving/downloads), [createSignedUrls](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls), [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route).
