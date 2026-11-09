import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const buyer = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002';
const chapters = Array.from({ length: 5 }, (_, i) => `10000000-0000-4000-8000-00000000000${i + 1}`);
let db: PGlite;
async function asUser<T>(id: string, role: string, action: () => Promise<T>) {
  await db.exec(
    `begin; set local role ${role}; select set_config('request.jwt.claim.sub','${id}',true);`,
  );
  try {
    return await action();
  } finally {
    await db.exec('rollback');
  }
}
async function visible(table: string, id = buyer, role = 'authenticated') {
  return asUser(id, role, async () => {
    const r = await db.query(`select * from ${table}`);
    return r.rows;
  });
}
beforeAll(async () => {
  db = new PGlite();
  // Real PostgreSQL RLS engine. Only Supabase-owned auth/storage schemas are
  // minimally modelled here; full Storage HTTP behavior is tested separately.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select on storage.objects to anon,authenticated;`);
  await db.exec(readFileSync('supabase/migrations/202611090001_private_reader.sql', 'utf8'));
  await db.exec(`insert into auth.users values ('${buyer}'),('${other}');
 insert into public.chapters(id,title) values ${chapters.map((id, i) => `('${id}','Chapter ${i + 1}')`).join(',')};
 insert into public.purchases(user_id,chapter_id,status,revoked_at) values
 ('${buyer}','${chapters[0]}','paid',null),
 ('${buyer}','${chapters[1]}','refunded',null),
 ('${buyer}','${chapters[2]}','paid',now()),
 ('${buyer}','${chapters[3]}','pending',null),
 ('${other}','${chapters[4]}','paid',null);
 insert into public.chapter_panels(chapter_id,position,object_path,width,height) values ${chapters.map((id) => `('${id}',1,'${id}/01.webp',900,690)`).join(',')};
 insert into storage.objects(bucket_id,name) values ${chapters.map((id) => `('comic-panels','${id}/01.webp')`).join(',')},('comic-panels','unmapped.webp'),('comic-panels','${chapters[0]}/unmapped.webp');`);
});
afterAll(async () => {
  await db.close();
});
describe('actual PostgreSQL RLS', () => {
  it('buyer sees only their paid, non-revoked entitlement', async () => {
    const rows = await visible('public.purchases');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: buyer, chapter_id: chapters[0], status: 'paid' });
  });
  it('buyer sees only purchased chapter and panel metadata', async () => {
    expect(await visible('public.chapters')).toHaveLength(1);
    expect(await visible('public.chapter_panels')).toHaveLength(1);
  });
  it('buyer sees exactly the mapped purchased storage object', async () => {
    const rows = await visible('storage.objects');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: `${chapters[0]}/01.webp` });
  });
  it('other buyer cannot read first buyer chapter', async () => {
    const rows = await visible('storage.objects', other);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: `${chapters[4]}/01.webp` });
  });
  it('unauthenticated role sees no storage objects', async () => {
    expect(await visible('storage.objects', '', 'anon')).toHaveLength(0);
  });
  it('authenticated role without JWT subject sees nothing', async () => {
    expect(await visible('storage.objects', '')).toHaveLength(0);
  });
  it('authenticated user cannot forge purchases', async () => {
    await expect(
      asUser(buyer, 'authenticated', () =>
        db.exec(
          `insert into public.purchases(user_id,chapter_id,status) values ('${buyer}','${chapters[4]}','paid')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it('authenticated user cannot alter purchase status or revoke metadata', async () => {
    await expect(
      asUser(buyer, 'authenticated', () => db.exec(`update public.purchases set status='paid'`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(buyer, 'authenticated', () => db.exec(`delete from public.chapter_panels`)),
    ).rejects.toThrow(/permission denied/);
  });
  it('anonymous role has no purchase-table privileges', async () => {
    await expect(visible('public.purchases', '', 'anon')).rejects.toThrow(/permission denied/);
  });
  it('restrictive storage guard survives an accidental broad permissive policy', async () => {
    await db.exec(
      `create policy "accidental broad read" on storage.objects for select to authenticated,anon using(true);`,
    );
    try {
      expect(await visible('storage.objects')).toHaveLength(1);
      expect(await visible('storage.objects', '', 'anon')).toHaveLength(0);
    } finally {
      await db.exec('drop policy "accidental broad read" on storage.objects');
    }
  });
  it('the bucket is private', async () => {
    const { rows } = await db.query('select public from storage.buckets');
    expect(rows).toEqual([{ public: false }]);
  });
});
