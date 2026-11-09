import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
export function localClients() {
  const status = JSON.parse(
    execFileSync('node_modules/.bin/supabase', ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  if (status.API_URL !== 'http://127.0.0.1:54321')
    throw new Error('This fixture script only runs against the local Supabase stack.');
  const auth = { persistSession: false, autoRefreshToken: false };
  return {
    status,
    admin: createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth }),
    newClient: () =>
      createClient(status.API_URL, status.PUBLISHABLE_KEY ?? status.ANON_KEY, { auth }),
  };
}
export function must(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function panelBytes(name = 'harbour', width = 900) {
  return sharp(readFileSync(`public/art/${name}.svg`), { density: (72 * width) / 900 })
    .png()
    .toBuffer();
}
