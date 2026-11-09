'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  configured: boolean;
  busy: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<boolean>;
};
export function SignInDialog({ open, configured, busy, onClose, onSignIn }: Props) {
  const modal = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const attempt = useRef(0);
  useEffect(() => {
    if (!open) {
      attempt.current++;
      modal.current?.close();
      setPassword('');
      setError('');
      return;
    }
    const returnFocus = document.activeElement as HTMLElement | null;
    modal.current?.showModal();
    return () => {
      attempt.current++;
      modal.current?.close();
      returnFocus?.focus();
    };
  }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const id = ++attempt.current;
    setError('');
    try {
      if ((await onSignIn(email, password)) && id === attempt.current) onClose();
    } catch (e) {
      if (id === attempt.current) setError(e instanceof Error ? e.message : 'Unable to sign in.');
    }
  }
  return (
    <dialog ref={modal} aria-labelledby="login-title" onCancel={onClose} className="login-dialog">
      <button className="dialog-close" aria-label="Close sign in" onClick={onClose}>
        ×
      </button>
      <p className="eyebrow">YOUR BRIVEL LIBRARY</p>
      <h2 id="login-title">Welcome back.</h2>
      <p>Sign in to open your purchased chapter.</p>
      {configured ? (
        <form onSubmit={submit}>
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
            {busy ? 'Opening your chapter…' : 'Sign in & read'} <span aria-hidden="true">↗</span>
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
          <button className="primary" onClick={onClose}>
            Continue with the sample <span aria-hidden="true">↗</span>
          </button>
        </div>
      )}
    </dialog>
  );
}
