'use client';
import { useEffect, useState } from 'react';
import { usePrivateChapter } from '@/hooks/use-private-chapter';
import { sample, sampleTitles } from '@/lib/sample-story';
import { SignInDialog } from './sign-in-dialog';

const chapterId = process.env.NEXT_PUBLIC_CHAPTER_ID ?? '10000000-0000-4000-8000-000000000001';
function Arrow({ left = false }: { left?: boolean }) {
  return <span aria-hidden="true">{left ? '←' : '↗'}</span>;
}
export function Reader({ configured }: { configured: boolean }) {
  const session = usePrivateChapter(chapterId, configured);
  const panels = session.manifest?.panels ?? sample;
  const privateReading = session.manifest !== null;
  const [dialog, setDialog] = useState(false);
  const [notes, setNotes] = useState(false);
  const [wide, setWide] = useState(false);
  const [chapter, setChapter] = useState(3);
  const [progress, setProgress] = useState(0);
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
  function closeDialog() {
    session.cancelPending();
    setDialog(false);
  }
  function selectSample(nextChapter: number) {
    void session.showSample();
    setChapter(nextChapter);
    document
      .getElementById('chapter-reader')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            setDialog(true);
          }}
        >
          {' '}
          {privateReading ? 'Your account' : 'Sign in'} <Arrow />
        </button>
      </header>
      <div className="preview-strip">
        <span>
          <i />
          {!privateReading
            ? 'Reader preview · public sample artwork'
            : 'Private chapter · authenticated reading'}
        </span>
        {!privateReading ? (
          <button
            onClick={() => {
              setDialog(true);
            }}
          >
            Open private chapter <Arrow />
          </button>
        ) : (
          <button onClick={() => selectSample(3)}>
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
          <span>
            {privateReading ? 'Purchased chapter' : `Chapter ${String(chapter).padStart(2, '0')}`}
          </span>
        </div>
        <section className="chapter-heading">
          <div>
            <p className="eyebrow">
              {privateReading ? 'YOUR LIBRARY' : 'THE QUIET TIDE'} <span> / </span>{' '}
              {privateReading ? 'PURCHASED CHAPTER' : `CHAPTER ${String(chapter).padStart(2, '0')}`}
            </p>
            <h1>{privateReading ? 'Your purchased chapter' : sampleTitles[chapter - 1]}</h1>
            <p className="dek">Some things find their way back to us.</p>
          </div>
          <div className="chapter-meta">
            <span>{privateReading ? 'Private edition' : 'Slice of life · Mystery'}</span>
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
              {sampleTitles.map((title, i) => (
                <li key={title}>
                  <button
                    aria-current={!privateReading && chapter === i + 1 ? 'page' : undefined}
                    onClick={() => selectSample(i + 1)}
                  >
                    <span className="chapter-num">0{i + 1}</span>
                    <span>{title}</span>
                    {!privateReading && chapter === i + 1 && <span aria-hidden="true">↗</span>}
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
              <span>{!privateReading ? 'SAMPLE EDITION' : 'PURCHASED CHAPTER'}</span>
              <button onClick={() => setWide(!wide)} aria-pressed={wide}>
                {wide ? 'Standard width' : 'Widen reader'} <span aria-hidden="true">⤢</span>
              </button>
            </div>
            <div id="story" className="story">
              {session.error && !dialog && (
                <div className="reader-error" role="alert">
                  <h2>Let’s reopen this chapter.</h2>
                  <p>{session.error}</p>
                  <button onClick={() => setDialog(true)}>Sign in</button>
                  <button onClick={() => selectSample(3)}>Read the sample</button>
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
                    onError={() => void session.imageFailed(panel.url)}
                  />
                  {i === 0 && (
                    <figcaption>
                      <span>
                        {privateReading
                          ? panels[0].alt_text
                          : '01 — The harbour, just before dawn.'}
                      </span>
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
                    {!privateReading
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
              <span>
                {privateReading
                  ? 'PRIVATE CHAPTER'
                  : `CHAPTER ${String(chapter).padStart(2, '0')} / 03`}
              </span>
              <button
                disabled={privateReading || chapter === 3}
                onClick={() => selectSample(chapter + 1)}
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
      <SignInDialog
        open={dialog}
        configured={configured}
        busy={session.busy}
        onClose={closeDialog}
        onSignIn={async (email, password) => {
          const opened = await session.open(email, password);
          if (opened) setChapter(3);
          return opened;
        }}
      />
    </>
  );
}
