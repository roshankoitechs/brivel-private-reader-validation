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
