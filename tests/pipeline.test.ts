import { describe, it, expect, vi } from 'vitest';
import { panelPipeline } from '../src/lib/panel-pipeline';
import type { Database } from '../src/lib/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
const chapter = '10000000-0000-4000-8000-000000000001';
const panel = {
  id: 'panel-1',
  position: 1,
  object_path: `${chapter}/01.webp`,
  alt_text: 'A harbour',
  width: 900,
  height: 690,
};
function fixture(
  options: {
    authError?: boolean;
    authStatus?: number;
    readError?: boolean;
    rows?: unknown[];
    signError?: boolean;
    signed?: unknown[];
    throw?: boolean;
    anonymous?: boolean;
  } = {},
) {
  const sign = vi.fn().mockResolvedValue({
    data: options.signed ?? [
      { path: panel.object_path, signedUrl: 'https://storage.example/signed?token=redacted' },
    ],
    error: options.signError ? new Error('private provider detail') : null,
  });
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: options.rows ?? [panel],
      error: options.readError ? new Error('database detail') : null,
    }),
  };
  const auth = vi.fn().mockImplementation(async () => {
    if (options.throw) throw new Error('network detail');
    return {
      data: {
        user: options.authError ? null : { id: 'buyer', is_anonymous: options.anonymous ?? false },
      },
      error: options.authError
        ? Object.assign(new Error('token detail'), { status: options.authStatus ?? 401 })
        : null,
    };
  });
  const from = vi.fn().mockReturnValue(query);
  const storageFrom = vi.fn().mockReturnValue({ createSignedUrls: sign });
  const client = {
    auth: { getUser: auth },
    from,
    storage: { from: storageFrom },
  } as unknown as SupabaseClient<Database>;
  return { client, sign, query, auth, from, storageFrom };
}
const request = (authorization: string | null = 'Bearer valid-user-token') =>
  new Request('http://localhost/api/chapters/' + chapter + '/panels', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
describe('private panel pipeline', () => {
  it('verifies identity, uses only trusted paths and signs for exactly 120 seconds', async () => {
    const f = fixture();
    const r = await panelPipeline(request(), chapter, f.client);
    const b = await r.json();
    expect(r.status).toBe(200);
    expect(f.auth).toHaveBeenCalledWith('valid-user-token');
    expect(f.query.eq).toHaveBeenCalledWith('chapter_id', chapter);
    expect(f.storageFrom).toHaveBeenCalledWith('comic-panels');
    expect(f.sign).toHaveBeenCalledWith([panel.object_path], 120);
    expect(b.expiresIn).toBe(120);
    expect(b.panels[0]).toEqual({
      id: 'panel-1',
      position: 1,
      alt_text: 'A harbour',
      width: 900,
      height: 690,
      url: expect.any(String),
    });
    expect(b.panels[0]).not.toHaveProperty('object_path');
    expect(r.headers.get('cache-control')).toContain('no-store');
    expect(r.headers.get('vary')).toBe('Authorization');
  });
  it.each([null, 'Basic secret', 'Bearer', 'Bearer one two', 'Bearer ' + 'x'.repeat(8193)])(
    'rejects malformed or absent authorization: %s',
    async (h) => {
      const f = fixture();
      expect((await panelPipeline(request(h), chapter, f.client)).status).toBe(401);
      expect(f.sign).not.toHaveBeenCalled();
      expect(f.from).not.toHaveBeenCalled();
    },
  );
  it('does not trust an invalid token', async () => {
    const f = fixture({ authError: true });
    expect((await panelPipeline(request(), chapter, f.client)).status).toBe(401);
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each([0, 429, 500, 503])(
    'reports Auth outage/rate limiting (%s) as a retryable 503',
    async (status) => {
      const f = fixture({ authError: true, authStatus: status });
      const r = await panelPipeline(request(), chapter, f.client);
      expect(r.status).toBe(503);
      expect(f.from).not.toHaveBeenCalled();
      expect(f.sign).not.toHaveBeenCalled();
      expect(await r.text()).not.toContain('token detail');
    },
  );
  it('rejects anonymous Supabase accounts', async () => {
    const f = fixture({ anonymous: true });
    expect((await panelPipeline(request(), chapter, f.client)).status).toBe(401);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects invalid chapter identifiers before touching services', async () => {
    const f = fixture();
    expect((await panelPipeline(request(), '../../private', f.client)).status).toBe(400);
    expect(f.auth).not.toHaveBeenCalled();
  });
  it('returns indistinguishable 404 for missing or RLS-hidden chapters', async () => {
    const f = fixture({ rows: [] });
    expect((await panelPipeline(request(), chapter, f.client)).status).toBe(404);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('fails closed on a database error', async () => {
    const f = fixture({ readError: true });
    const r = await panelPipeline(request(), chapter, f.client);
    expect(r.status).toBe(503);
    expect(f.sign).not.toHaveBeenCalled();
    expect(await r.text()).not.toContain('database detail');
  });
  it.each([
    { signError: true },
    { signed: [{ path: panel.object_path, signedUrl: '', error: 'not found' }] },
    { signed: [] },
    { signed: [{ path: 'another/chapter.webp', signedUrl: 'https://example.com' }] },
  ])('never returns partial or mismatched signing results', async (options) => {
    const f = fixture(options);
    const r = await panelPipeline(request(), chapter, f.client);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('https://');
  });
  it('rejects a chapter over the bounded 50-panel limit', async () => {
    const f = fixture({ rows: Array(51).fill(panel) });
    expect((await panelPipeline(request(), chapter, f.client)).status).toBe(503);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('does not expose thrown provider details', async () => {
    const f = fixture({ throw: true });
    const r = await panelPipeline(request(), chapter, f.client);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain('network detail');
  });
  it('maps signed results by path, independent of provider ordering', async () => {
    const second = { ...panel, id: 'panel-2', position: 2, object_path: 'chapter/02.webp' };
    const f = fixture({
      rows: [panel, second],
      signed: [
        { path: second.object_path, signedUrl: 'second' },
        { path: panel.object_path, signedUrl: 'first' },
      ],
    });
    const b = await (await panelPipeline(request(), chapter, f.client)).json();
    expect(b.panels.map((p: { url: string }) => p.url)).toEqual(['first', 'second']);
  });
});
