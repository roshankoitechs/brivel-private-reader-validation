'use client';
import { useEffect, useRef, useState } from 'react';
import { type SupabaseClient } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/browser-client';
import type { Database } from '@/lib/database.types';
import type { PanelManifest, SignedPanel } from '@/lib/panel-pipeline';

const chapterId = process.env.NEXT_PUBLIC_CHAPTER_ID ?? '10000000-0000-4000-8000-000000000001';
const sample: SignedPanel[] = [
  {
    id: 'harbour',
    position: 1,
    url: '/art/harbour.svg',
    alt_text:
      'An olive-green harbour at dawn. A lone figure waits on the quay beside a small sailboat.',
    width: 900,
    height: 690,
  },
  {
    id: 'window',
    position: 2,
    url: '/art/window.svg',
    alt_text:
      'A cup of coffee and an open notebook beneath a tall window facing the sea. The sea had kept its own time.',
    width: 900,
    height: 900,
  },
  {
    id: 'letter',
    position: 3,
    url: '/art/letter.svg',
    alt_text: 'A sealed letter lies on a wooden table. But that morning, something changed.',
    width: 900,
    height: 800,
  },
];
function Arrow({ left = false }: { left?: boolean }) {
  return <span aria-hidden="true">{left ? '←' : '↗'}</span>;
}
export function Reader({ configured }: { configured: boolean }) {
  const [panels, setPanels] = useState<SignedPanel[]>(sample);
  const [mode, setMode] = useState<'sample' | 'private'>('sample');
  const [dialog, setDialog] = useState(false),
    [notes, setNotes] = useState(false),
    [wide, setWide] = useState(false);
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [chapter, setChapter] = useState(3),
    [progress, setProgress] = useState(0);
  const client = useRef<SupabaseClient<Database> | null>(null),
    expiry = useRef(0),
    refreshes = useRef(0),
    requestId = useRef(0);
  const modal = useRef<HTMLDialogElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (configured) client.current = getBrowserClient();
    return () => {
      client.current = null;
    };
  }, [configured]);
  useEffect(() => {
    if (dialog) {
      returnFocus.current = document.activeElement as HTMLElement;
      modal.current?.showModal();
    } else if (modal.current?.open) {
      modal.current.close();
      returnFocus.current?.focus();
    }
  }, [dialog]);
  useEffect(() => {
    const update = () => {
      const el = document.getElementById('story');
      if (!el) return;
      const span = el.scrollHeight - window.innerHeight;
      setProgress(
        Math.max(
          0,
          Math.min(100, Math.round((-el.getBoundingClientRect().top / Math.max(span, 1)) * 100)),
        ),
      );
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);
  async function loadPrivate() {
    if (!client.current) throw new Error('Connect a Supabase project to use private reading.');
    // getSession is only token transport. The server validates it with getUser.
    const {
      data: { session },
    } = await client.current.auth.getSession();
    if (!session) throw new Error('Your session has ended. Please sign in again.');
    const response = await fetch(`/api/chapters/${chapterId}/panels`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: 'no-store',
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Unable to open this chapter.');
    return body as PanelManifest;
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!client.current) return;
    setBusy(true);
    setError('');
    const id = ++requestId.current;
    try {
      const { error: authError } = await client.current.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw new Error('Unable to sign in. Check your email and password.');
      const manifest = await loadPrivate();
      if (id !== requestId.current) return;
      setPanels(manifest.panels);
      expiry.current = Date.parse(manifest.refreshAfter);
      refreshes.current = 0;
      setMode('private');
      setDialog(false);
      setPassword('');
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function refreshFailedImage() {
    if (mode !== 'private' || busy || refreshes.current >= 1) return;
    if (Date.now() < expiry.current) {
      setError('An image could not be loaded. Please reopen the chapter.');
      return;
    }
    refreshes.current++;
    setBusy(true);
    const id = ++requestId.current;
    try {
      const manifest = await loadPrivate();
      if (id !== requestId.current) return;
      setPanels(manifest.panels);
      expiry.current = Date.parse(manifest.refreshAfter);
      setError('');
    } catch (e) {
      if (id === requestId.current) {
        setPanels([]);
        setError(e instanceof Error ? e.message : 'Please sign in again.');
      }
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function useSample() {
    requestId.current++;
    setBusy(false);
    setMode('sample');
    setPanels(sample);
    setError('');
    setChapter(3);
    await client.current?.auth.signOut({ scope: 'local' });
  }
  return (
    <>
      <a className="skip" href="#story">
        Skip to story
      </a>
      <header className="site-header" id="top">
        <a href="/" className="wordmark" aria-label="Brivel home">
          brivel
        </a>
        <nav aria-label="Main navigation">
          <a href="#chapters">The series</a>
          <button onClick={() => setNotes(!notes)} aria-expanded={notes}>
            About this edition
          </button>
        </nav>
        <button
          className="account"
          onClick={() => {
            setError('');
            setDialog(true);
          }}
        >
          {' '}
          {mode === 'private' ? 'Your account' : 'Sign in'} <Arrow />
        </button>
      </header>
      <div className="preview-strip">
        <span>
          <i />
          {mode === 'sample'
            ? 'Reader preview · public sample artwork'
            : 'Private chapter · authenticated reading'}
        </span>
        {mode === 'sample' ? (
          <button
            onClick={() => {
              setError('');
              setDialog(true);
            }}
          >
            Open private chapter <Arrow />
          </button>
        ) : (
          <button onClick={useSample}>
            Return to preview <Arrow />
          </button>
        )}
      </div>
      {notes && (
        <section className="edition" aria-label="About this edition">
          <div>
            <p className="eyebrow">A practical validation</p>
            <h2>
              A small reader.
              <br />A careful foundation.
            </h2>
          </div>
          <div>
            <p>
              This edition demonstrates Brivel’s chapter reading experience. The preview uses
              original public vector illustrations. Private reading requires Supabase sign-in and a
              valid chapter purchase.
            </p>
            <p>
              Private image links last 120 seconds. Access is checked by database and Storage
              policies. Expiring links limit sharing; they cannot prevent a reader from saving an
              image already delivered to their browser.
            </p>
            <button className="text-button" onClick={() => setNotes(false)}>
              Close notes ×
            </button>
          </div>
        </section>
      )}
      <main>
        <div className="breadcrumb">
          <a href="#chapters">The Quiet Tide</a>
          <span>/</span>
          <span>Chapter {String(chapter).padStart(2, '0')}</span>
        </div>
        <section className="chapter-heading">
          <div>
            <p className="eyebrow">
              THE QUIET TIDE <span> / </span> CHAPTER {String(chapter).padStart(2, '0')}
            </p>
            <h1>
              {chapter === 3
                ? 'Letters from the shore'
                : chapter === 1
                  ? 'The return'
                  : 'A familiar silence'}
            </h1>
            <p className="dek">Some things find their way back to us.</p>
          </div>
          <div className="chapter-meta">
            <span>Slice of life · Mystery</span>
            <span>
              {panels.length} panels <b>·</b> 2 min read
            </span>
          </div>
        </section>
        <div className={`reading-layout ${wide ? 'expanded' : ''}`}>
          <aside className="series" id="chapters">
            <p className="eyebrow">THE SERIES</p>
            <h2>
              The Quiet
              <br />
              Tide<span>.</span>
            </h2>
            <p>
              A letter. A harbour town.
              <br />
              And everything left unsaid.
            </p>
            <div className="series-divider" />
            <p className="eyebrow">CHAPTERS</p>
            <ol>
              {['The return', 'A familiar silence', 'Letters from the shore'].map((title, i) => (
                <li key={title}>
                  <button
                    aria-current={chapter === i + 1 ? 'page' : undefined}
                    onClick={() => {
                      if (mode === 'private') {
                        void useSample();
                      }
                      setChapter(i + 1);
                      setPanels(sample);
                      document
                        .getElementById('chapter-reader')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    <span className="chapter-num">0{i + 1}</span>
                    <span>{title}</span>
                    {chapter === i + 1 && <span aria-hidden="true">↗</span>}
                  </button>
                </li>
              ))}
            </ol>
            <p className="sample-note">
              An original sample story.
              <br />
              Preview chapters share the same artwork.
            </p>
            <a
              className="back-link"
              href="#top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <Arrow left /> Back to the beginning
            </a>
          </aside>
          <article id="chapter-reader" aria-label="Chapter reader">
            <div className="reader-toolbar">
              <span>{mode === 'sample' ? 'SAMPLE EDITION' : 'PURCHASED CHAPTER'}</span>
              <button onClick={() => setWide(!wide)} aria-pressed={wide}>
                {wide ? 'Standard width' : 'Widen reader'} <span aria-hidden="true">⤢</span>
              </button>
            </div>
            <div id="story" className="story">
              {error && !dialog && (
                <div className="reader-error" role="alert">
                  <h2>Let’s reopen this chapter.</h2>
                  <p>{error}</p>
                  <button onClick={() => setDialog(true)}>Sign in</button>
                  <button onClick={useSample}>Read the sample</button>
                </div>
              )}
              {panels.map((panel, i) => (
                <figure key={panel.id}>
                  <img
                    src={panel.url}
                    alt={panel.alt_text}
                    width={panel.width}
                    height={panel.height}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={refreshFailedImage}
                  />
                  {i === 0 && (
                    <figcaption>
                      <span>01 — The harbour, just before dawn.</span>
                      <span>THE QUIET TIDE</span>
                    </figcaption>
                  )}
                </figure>
              ))}
              {panels.length > 0 && (
                <div className="end-note">
                  <span className="end-mark">b.</span>
                  <p>Until the next tide.</p>
                  <span>
                    {mode === 'sample'
                      ? 'You’ve reached the end of this sample.'
                      : 'You’ve reached the end of this chapter.'}
                  </span>
                  <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    Back to top ↑
                  </button>
                </div>
              )}
            </div>
            <div className="reader-bottom">
              <span>CHAPTER {String(chapter).padStart(2, '0')} / 03</span>
              <button
                disabled={chapter === 3}
                onClick={() => {
                  setChapter(chapter + 1);
                  document.getElementById('chapter-reader')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Next chapter <Arrow />
              </button>
            </div>
          </article>
          <aside className="reading-note">
            <span className="vertical-rule" />
            <p>
              TAKE
              <br />
              YOUR
              <br />
              TIME.
            </p>
            <span>
              A story is a place
              <br />
              to stay a while.
            </span>
            <div className="progress-track" aria-label={`Reading progress ${progress}%`}>
              <div style={{ height: `${progress}%` }} />
            </div>
            <span className="progress-label">{progress}%</span>
          </aside>
        </div>
      </main>
      <footer>
        <a className="wordmark" href="/">
          brivel
        </a>
        <p>Stories, at your own pace.</p>
        <span>READER STUDY / 2026</span>
      </footer>
      <dialog
        aria-labelledby="login-title"
        ref={modal}
        onCancel={() => {
          requestId.current++;
          setBusy(false);
          setDialog(false);
        }}
        className="login-dialog"
      >
        <button
          className="dialog-close"
          aria-label="Close sign in"
          onClick={() => {
            requestId.current++;
            setBusy(false);
            setDialog(false);
          }}
        >
          ×
        </button>
        <p className="eyebrow">YOUR BRIVEL LIBRARY</p>
        <h2 id="login-title">Welcome back.</h2>
        <p>Sign in to open your purchased chapter.</p>
        {configured ? (
          <form onSubmit={signIn}>
            <label>
              Email
              <input
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? 'Opening your chapter…' : 'Sign in & read'} <Arrow />
            </button>
            <small>
              No checkout is included in this validation. A verified purchase record must already
              exist.
            </small>
          </form>
        ) : (
          <div className="setup-note">
            <p>
              This preview isn’t connected to Supabase yet. The source includes the private reader
              endpoint, database policies and setup instructions.
            </p>
            <button className="primary" onClick={() => setDialog(false)}>
              Continue with the sample <Arrow />
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
