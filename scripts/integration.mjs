import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { localClients, must, panelBytes } from './local-support.mjs';
const { status, admin, newClient } = localClients();
const base = process.env.LOCAL_APP_URL ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error('Integration tests only target loopback.');
const chapter = randomUUID(),
  foreignChapter = randomUUID(),
  users = [],
  paths = [];
let count = 0;
const check = (name, action) => async () => {
  await action();
  count++;
  console.log(`PASS ${name}`);
};
try {
  const password = `Local-${randomUUID()}!`;
  for (const label of ['buyer', 'stranger']) {
    const data = must(
      await admin.auth.admin.createUser({
        email: `${label}-${randomUUID()}@brivel.test`,
        password,
        email_confirm: true,
      }),
    );
    users.push(data.user);
  }
  const buyer = newClient(),
    stranger = newClient(),
    guest = newClient();
  const auth = must(await buyer.auth.signInWithPassword({ email: users[0].email, password }));
  must(await stranger.auth.signInWithPassword({ email: users[1].email, password }));
  must(
    await admin.from('chapters').insert([
      { id: chapter, title: 'Integration chapter' },
      { id: foreignChapter, title: 'Unpurchased chapter' },
    ]),
  );
  const purchase = must(
    await admin
      .from('purchases')
      .insert({ user_id: users[0].id, chapter_id: chapter, status: 'paid' })
      .select('id')
      .single(),
  );
  for (const id of [chapter, foreignChapter]) {
    const path = `${id}/1.png`;
    paths.push(path);
    must(
      await admin.storage
        .from('comic-panels')
        .upload(path, await panelBytes(), { contentType: 'image/png', cacheControl: '0' }),
    );
    must(
      await admin
        .from('chapter_panels')
        .insert({
          chapter_id: id,
          position: 1,
          object_path: path,
          alt_text: 'Integration fixture',
          width: 900,
          height: 690,
        }),
    );
  }
  const api = (token, id = chapter) =>
    fetch(`${base}/api/chapters/${id}/panels`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  let manifest, issuedToken;
  await check('Buyer receives chapter manifest; response is never cached', async () => {
    const r = await api(auth.session.access_token);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control'), /no-store/);
    manifest = await r.json();
    assert.equal(manifest.expiresIn, 120);
    assert.equal(manifest.panels.length, 1);
  })();
  await check('Actual signed JWT lifetime is exactly 120 seconds', async () => {
    issuedToken = new URL(manifest.panels[0].url).searchParams.get('token');
    const claims = JSON.parse(Buffer.from(issuedToken.split('.')[1], 'base64url'));
    assert.equal(claims.exp - claims.iat, 120);
  })();
  await check('Signed URL returns real high-resolution PNG without cookies', async () => {
    const r = await fetch(manifest.panels[0].url);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /image\/png/);
    assert.ok((await r.arrayBuffer()).byteLength > 5000);
  })();
  await check('Guest endpoint returns 401', async () => {
    assert.equal((await api(null)).status, 401);
  })();
  await check('Forged bearer token returns 401', async () => {
    assert.equal((await api('forged.jwt.token')).status, 401);
  })();
  await check('Unpurchased chapter returns non-enumerating 404', async () => {
    assert.equal((await api(auth.session.access_token, foreignChapter)).status, 404);
  })();
  await check('Another user cannot request buyer chapter', async () => {
    const session = must(await stranger.auth.getSession()).session;
    assert.equal((await api(session.access_token)).status, 404);
  })();
  await check('Direct Storage signing is denied to another user', async () => {
    const r = await stranger.storage.from('comic-panels').createSignedUrl(paths[0], 120);
    assert.ok(r.error);
  })();
  await check('Direct Storage signing is denied to guests', async () => {
    assert.ok((await guest.storage.from('comic-panels').createSignedUrl(paths[0], 120)).error);
  })();
  await check('Private object cannot be fetched from public URL', async () => {
    const url = guest.storage.from('comic-panels').getPublicUrl(paths[0]).data.publicUrl;
    assert.notEqual((await fetch(url)).status, 200);
  })();
  await check('Buyer cannot forge a purchase through PostgREST', async () => {
    assert.ok(
      (
        await buyer
          .from('purchases')
          .insert({ user_id: users[0].id, chapter_id: foreignChapter, status: 'paid' })
      ).error,
    );
  })();
  await check('Buyer cannot change the object-to-chapter mapping', async () => {
    assert.ok(
      (
        await buyer
          .from('chapter_panels')
          .update({ chapter_id: chapter })
          .eq('chapter_id', foreignChapter)
      ).error,
    );
  })();
  await check('Pending purchase cannot read or sign', async () => {
    must(await admin.from('purchases').update({ status: 'pending' }).eq('id', purchase.id));
    assert.equal((await api(auth.session.access_token)).status, 404);
    assert.ok((await buyer.storage.from('comic-panels').createSignedUrl(paths[0], 120)).error);
  })();
  await check('Refunded purchase cannot read or sign', async () => {
    must(await admin.from('purchases').update({ status: 'refunded' }).eq('id', purchase.id));
    assert.equal((await api(auth.session.access_token)).status, 404);
    assert.ok((await buyer.storage.from('comic-panels').createSignedUrl(paths[0], 120)).error);
  })();
  await check('Revoked purchase cannot read or sign', async () => {
    must(
      await admin
        .from('purchases')
        .update({ status: 'paid', revoked_at: new Date().toISOString() })
        .eq('id', purchase.id),
    );
    assert.equal((await api(auth.session.access_token)).status, 404);
    assert.ok((await buyer.storage.from('comic-panels').createSignedUrl(paths[0], 120)).error);
  })();
  await check('An already-issued URL remains usable until expiry after revocation', async () => {
    assert.equal((await fetch(manifest.panels[0].url)).status, 200);
  })();
  await check('Tampered signed URL is rejected', async () => {
    const url = new URL(manifest.panels[0].url);
    url.searchParams.set('token', issuedToken.slice(0, -8) + 'tampered');
    assert.notEqual((await fetch(url)).status, 200);
  })();
  console.log(
    'Waiting for the actual signed URL to expire (120 seconds from issue, plus clock tolerance)…',
  );
  const claims = JSON.parse(Buffer.from(issuedToken.split('.')[1], 'base64url'));
  while (Date.now() < (claims.exp + 3) * 1000)
    await pause(Math.min(10000, (claims.exp + 3) * 1000 - Date.now()));
  await check('Expired signed URL is rejected by the real Storage API', async () => {
    assert.notEqual((await fetch(manifest.panels[0].url)).status, 200);
  })();
  console.log(
    `PASS ${count} integration checks against real local Supabase Auth, PostgreSQL, Storage and Next.js.`,
  );
} finally {
  if (paths.length) must(await admin.storage.from('comic-panels').remove(paths));
  must(await admin.from('chapters').delete().in('id', [chapter, foreignChapter]));
  for (const user of users) must(await admin.auth.admin.deleteUser(user.id));
  console.log('Disposable integration fixtures cleaned up.');
}
