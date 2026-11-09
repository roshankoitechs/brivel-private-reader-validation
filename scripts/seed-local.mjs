import { writeFileSync } from 'node:fs';
import { localClients, must, panelBytes } from './local-support.mjs';
const { status, admin } = localClients();
const chapter = '10000000-0000-4000-8000-000000000001';
const email = 'reader@brivel.test',
  password = 'Brivel-Local-Only-2026!';
const users = must(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
const existing = users.find((u) => u.email === email);
const user =
  existing ??
  must(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
// This is a disposable local fixture. No live purchases or third-party email.
if (existing)
  must(await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true }));
must(await admin.from('chapters').upsert({ id: chapter, title: 'Letters from the shore' }));
const purchased = must(
  await admin.from('purchases').select('id').eq('user_id', user.id).eq('chapter_id', chapter),
);
if (!purchased.length)
  must(
    await admin.from('purchases').insert({ user_id: user.id, chapter_id: chapter, status: 'paid' }),
  );
for (const [i, name] of ['harbour', 'window', 'letter'].entries()) {
  const path = `${chapter}/${i + 1}.png`;
  must(
    await admin.storage
      .from('comic-panels')
      .upload(path, await panelBytes(name), {
        contentType: 'image/png',
        cacheControl: '0',
        upsert: true,
      }),
  );
  must(
    await admin
      .from('chapter_panels')
      .upsert(
        {
          chapter_id: chapter,
          position: i + 1,
          object_path: path,
          alt_text: [
            'A quiet harbour at dawn.',
            'A cup of coffee beside a window overlooking the sea.',
            'A sealed letter on a wooden table.',
          ][i],
          width: 900,
          height: [690, 900, 800][i],
        },
        { onConflict: 'chapter_id,position' },
      ),
  );
}
writeFileSync(
  '.env.local',
  `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY ?? status.ANON_KEY}\nNEXT_PUBLIC_CHAPTER_ID=${chapter}\n`,
  { mode: 0o600 },
);
console.log('Local reader fixture is ready. No cloud project was changed.');
console.log('Demo sign-in: reader@brivel.test / Brivel-Local-Only-2026! (local only)');
