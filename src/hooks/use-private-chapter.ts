'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '../lib/browser-client';
import { isPanelManifest, type PanelManifest } from '../lib/panel-contract';

/** Owns private reading only. Public story selection and dialog layout live in the view. */
export function usePrivateChapter(chapterId: string, configured: boolean) {
  const [manifest, setManifest] = useState<PanelManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef<PanelManifest | null>(null);
  const generation = useRef(0);
  const refreshAt = useRef(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  // Keep sign-out after any pending sign-in, and a new sign-in after sign-out.
  const authQueue = useRef(Promise.resolve());
  const expectedSignOut = useRef(false);
  const queueAuth = useCallback(<T>(action: () => Promise<T>) => {
    const result = authQueue.current.then(action);
    authQueue.current = result.then(
      () => {},
      () => {},
    );
    return result;
  }, []);

  const cancelPending = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    if (mounted.current) setBusy(false);
  }, []);
  const commit = useCallback((next: PanelManifest | null) => {
    current.current = next;
    // A local relative deadline avoids relying on the reader’s wall clock matching the server.
    refreshAt.current = next ? Date.now() + (next.expiresIn - 15) * 1000 : 0;
    setManifest(next);
    setError('');
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!configured)
      return () => {
        mounted.current = false;
        cancelPending();
      };
    const {
      data: { subscription },
    } = getBrowserClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !expectedSignOut.current) {
        cancelPending();
        commit(null);
      }
    });
    return () => {
      mounted.current = false;
      cancelPending();
      subscription.unsubscribe();
    };
  }, [configured, cancelPending, commit]);

  const loadManifest = useCallback(
    async (signal: AbortSignal) => {
      const {
        data: { session },
        error: sessionError,
      } = await getBrowserClient().auth.getSession();
      if (sessionError || !session)
        throw new Error('Your session has ended. Please sign in again.');
      // getSession only transports a token. The API verifies it with getUser.
      const response = await fetch(`/api/chapters/${chapterId}/panels`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'Unable to open this chapter. Please retry.';
        throw new Error(message);
      }
      if (!isPanelManifest(body))
        throw new Error('The reading service returned an invalid chapter.');
      return body;
    },
    [chapterId],
  );

  const open = useCallback(
    async (email: string, password: string) => {
      if (!configured) throw new Error('Connect a Supabase project to use private reading.');
      cancelPending();
      commit(null);
      const id = generation.current;
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      try {
        const { error: authError } = await queueAuth(() =>
          getBrowserClient().auth.signInWithPassword({ email, password }),
        );
        if (id !== generation.current || !mounted.current) return false;
        if (authError)
          throw new Error(
            [400, 401, 403].includes(authError.status ?? 0)
              ? 'Unable to sign in. Check your email and password.'
              : 'Sign-in service is temporarily unavailable. Please retry.',
          );
        const next = await loadManifest(controller.signal);
        if (id !== generation.current || !mounted.current) return false;
        commit(next);
        return true;
      } catch (e) {
        if (id !== generation.current || !mounted.current) return false;
        throw e instanceof Error ? e : new Error('Unable to open this chapter. Please retry.');
      } finally {
        if (id === generation.current && mounted.current) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [configured, cancelPending, queueAuth, loadManifest, commit],
  );

  const showSample = useCallback(async () => {
    cancelPending();
    commit(null);
    if (!configured) return;
    // Queue the auth operation even if another operation cancels its UI result.
    const id = generation.current;
    setBusy(true);
    try {
      await queueAuth(async () => {
        expectedSignOut.current = true;
        try {
          return await getBrowserClient().auth.signOut({ scope: 'local' });
        } finally {
          expectedSignOut.current = false;
        }
      });
    } catch {
      if (id === generation.current && mounted.current)
        setError('Unable to end the local session. Please retry.');
    } finally {
      if (id === generation.current && mounted.current) setBusy(false);
    }
  }, [configured, cancelPending, commit, queueAuth]);

  const imageFailed = useCallback(
    async (failedUrl: string) => {
      const active = current.current;
      // Old image events cannot renew a newer manifest or restore a closed chapter.
      if (!active?.panels.some((p) => p.url === failedUrl) || request.current) return;
      const fail = (message: string) => {
        current.current = null;
        setManifest({ ...active, panels: [] });
        setError(message);
      };
      if (Date.now() < refreshAt.current) {
        fail('An image could not be loaded. Please reopen the chapter.');
        return;
      }
      const id = generation.current;
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      try {
        const next = await loadManifest(controller.signal);
        if (id === generation.current && mounted.current) commit(next);
      } catch (e) {
        if (id === generation.current && mounted.current)
          fail(e instanceof Error ? e.message : 'Unable to reopen this chapter.');
      } finally {
        if (id === generation.current && mounted.current) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [loadManifest, commit],
  );

  return { manifest, busy, error, open, showSample, imageFailed, cancelPending };
}
