import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { POST as source } from '../src/app/api/chapters/[chapterId]/panels/route';
// @ts-expect-error Generated JavaScript artifact; exercised as executable submission code.
import { POST as submission } from '../work/submission-route.js';
const chapter = '10000000-0000-4000-8000-000000000001';
const panel = {
  id: 'panel-id',
  position: 1,
  object_path: 'chapter/01.png',
  alt_text: 'A harbour',
  width: 900,
  height: 690,
};
const token = 'reader-token-from-request';
let upstream: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  upstream = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.cache).toBe('no-store');
    if (url.includes('/auth/v1/user')) return Response.json({ id: 'buyer', is_anonymous: false });
    if (url.includes('/rest/v1/chapter_panels')) return Response.json([panel]);
    if (url.includes('/storage/v1/object/sign/comic-panels')) {
      expect(JSON.parse(String(init?.body))).toEqual({
        expiresIn: 120,
        paths: [panel.object_path],
      });
      return Response.json([
        {
          path: panel.object_path,
          signedURL: '/object/sign/comic-panels/chapter/01.png?token=signed',
        },
      ]);
    }
    throw new Error('Unexpected upstream request');
  });
  vi.stubGlobal('fetch', upstream);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request() {
  return new Request('https://reader.test/api', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
describe.each([
  ['repository', source],
  ['standalone submission', submission],
] as const)('%s route wiring', (_name, handler) => {
  it('preserves the reader identity across Auth, PostgREST and Storage with a 120-second signature', async () => {
    const r = await handler(request(), { params: Promise.resolve({ chapterId: chapter }) });
    expect(r.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(3);
    expect(r.headers.get('cache-control')).toContain('no-store');
    const data = await r.json();
    expect(data.expiresIn).toBe(120);
    expect(data.panels[0].url).toBe(
      'https://project.supabase.co/storage/v1/object/sign/comic-panels/chapter/01.png?token=signed',
    );
  });
  it('refuses a service-role/secret configuration before contacting any upstream', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_not_allowed');
    const r = await handler(request(), { params: Promise.resolve({ chapterId: chapter }) });
    expect(r.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('does not issue a Storage signature if Auth rejects the token', async () => {
    upstream.mockResolvedValue(Response.json({ message: 'bad token' }, { status: 401 }));
    const r = await handler(request(), { params: Promise.resolve({ chapterId: chapter }) });
    expect(r.status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
