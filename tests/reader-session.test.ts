// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrivateChapter } from '../src/hooks/use-private-chapter';

const { auth } = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));
vi.mock('../src/lib/browser-client', () => ({ getBrowserClient: () => ({ auth }) }));
const chapter = '10000000-0000-4000-8000-000000000001';
let now: number;
let authEvent: (event: string) => void;
let fetchMock: ReturnType<typeof vi.fn>;
function manifest(version = 1) {
  return {
    expiresIn: 120,
    refreshAfter: new Date(now + 105_000).toISOString(),
    panels: [
      {
        id: 'panel',
        position: 1,
        url: `https://storage.test/panel?version=${version}`,
        alt_text: 'A harbour',
        width: 900,
        height: 690,
      },
    ],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  now = Date.parse('2026-11-09T12:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'verified-by-server' } },
    error: null,
  });
  auth.signOut.mockImplementation(async () => {
    authEvent('SIGNED_OUT');
    return { error: null };
  });
  auth.onAuthStateChange.mockImplementation((callback) => {
    authEvent = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  fetchMock = vi.fn().mockImplementation(async () => Response.json(manifest()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function open(
  result: ReturnType<typeof renderHook<ReturnType<typeof usePrivateChapter>, unknown>>['result'],
) {
  await act(async () => {
    expect(await result.current.open('reader@brivel.test', 'local password')).toBe(true);
  });
}
describe('private reader lifecycle', () => {
  it('uses the session only to transport a bearer token and opens a validated manifest', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    expect(result.current.manifest?.panels).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/chapters/${chapter}/panels`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: { Authorization: 'Bearer verified-by-server' },
      }),
    );
  });
  it('renews URLs again on later expirations, with no lifetime one-retry limit', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    for (let version = 2; version <= 4; version++) {
      const oldUrl = result.current.manifest!.panels[0].url;
      now += 121_000;
      fetchMock.mockResolvedValueOnce(Response.json(manifest(version)));
      await act(async () => {
        await result.current.imageFailed(oldUrl);
      });
      expect(result.current.manifest?.panels[0].url).toContain(`version=${version}`);
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('does not enter a renewal loop when the server and reader clocks differ', async () => {
    const body = manifest();
    body.refreshAfter = new Date(now - 600_000).toISOString();
    fetchMock.mockResolvedValueOnce(Response.json(body));
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    const url = result.current.manifest!.panels[0].url;
    await act(async () => {
      await result.current.imageFailed(url);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.manifest?.panels).toEqual([]);
  });
  it('coalesces concurrent failed image events and ignores an old URL after renewal', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    const oldUrl = result.current.manifest!.panels[0].url;
    now += 121_000;
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    let first: Promise<void>;
    act(() => {
      first = result.current.imageFailed(oldUrl);
      void result.current.imageFailed(oldUrl);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      response.resolve(Response.json(manifest(2)));
      await first!;
    });
    await act(async () => {
      await result.current.imageFailed(oldUrl);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('clears the private view if authorization is lost during renewal', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    const oldUrl = result.current.manifest!.panels[0].url;
    now += 121_000;
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: 'Chapter unavailable or access not granted.' }, { status: 404 }),
    );
    await act(async () => {
      await result.current.imageFailed(oldUrl);
    });
    expect(result.current.manifest?.panels).toEqual([]);
    expect(result.current.error).toContain('access not granted');
  });
  it('does not loop when a newly issued image fails before the refresh hint', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    const url = result.current.manifest!.panels[0].url;
    await act(async () => {
      await result.current.imageFailed(url);
      await result.current.imageFailed(url);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.manifest?.panels).toEqual([]);
  });
  it('cannot restore private images after the reader returns to the public preview', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    const url = result.current.manifest!.panels[0].url;
    now += 121_000;
    const response = deferred<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    let renewal: Promise<void>;
    act(() => {
      renewal = result.current.imageFailed(url);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      await result.current.showSample();
      response.resolve(Response.json(manifest(2)));
      await renewal!;
    });
    expect(result.current.manifest).toBeNull();
  });
  it('does not fetch panels after a cancelled pending sign-in', async () => {
    const authResponse = deferred<{ error: null }>();
    auth.signInWithPassword.mockReturnValueOnce(authResponse.promise);
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    let opening: Promise<boolean>;
    act(() => {
      opening = result.current.open('reader@brivel.test', 'password');
    });
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1));
    act(() => result.current.cancelPending());
    await act(async () => {
      authResponse.resolve({ error: null });
      expect(await opening!).toBe(false);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.manifest).toBeNull();
  });
  it('orders pending sign-in, explicit sign-out and a subsequent sign-in correctly', async () => {
    const authResponse = deferred<{ error: null }>();
    auth.signInWithPassword.mockReturnValueOnce(authResponse.promise);
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    let old: Promise<boolean>, logout: Promise<void>, latest: Promise<boolean>;
    act(() => {
      old = result.current.open('old@brivel.test', 'password');
    });
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledTimes(1));
    act(() => {
      logout = result.current.showSample();
      latest = result.current.open('new@brivel.test', 'password');
    });
    await act(async () => {
      authResponse.resolve({ error: null });
      expect(await old!).toBe(false);
      await logout!;
      expect(await latest!).toBe(true);
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.manifest?.panels).toHaveLength(1);
  });
  it('clears private panels on an external sign-out event', async () => {
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await open(result);
    act(() => authEvent('SIGNED_OUT'));
    expect(result.current.manifest).toBeNull();
  });
  it('rejects malformed successful responses instead of crashing the renderer', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ panels: 'broken' }));
    const { result } = renderHook(() => usePrivateChapter(chapter, true));
    await act(async () => {
      await expect(result.current.open('reader@brivel.test', 'password')).rejects.toThrow(
        'invalid chapter',
      );
    });
    expect(result.current.manifest).toBeNull();
  });
});
