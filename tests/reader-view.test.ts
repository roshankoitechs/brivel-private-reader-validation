// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Reader } from '../src/components/reader';
const { auth } = vi.hoisted(() => ({
  auth: {
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
}));
vi.mock('../src/lib/browser-client', () => ({ getBrowserClient: () => ({ auth }) }));
beforeEach(() => {
  // jsdom does not implement native modal behavior; focus/viewport are checked in Chrome.
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        expiresIn: 120,
        refreshAfter: new Date(Date.now() + 105000).toISOString(),
        panels: [
          {
            id: 'private-panel',
            position: 1,
            url: 'https://storage.test/private.png',
            alt_text: 'Purchased image',
            width: 900,
            height: 690,
          },
        ],
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it('does not label a purchased chapter as a previously selected preview chapter', async () => {
  render(createElement(Reader, { configured: true }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^01\s*The return$/ }));
  });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The return');
  fireEvent.click(screen.getByRole('button', { name: /Open private chapter/ }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'reader@brivel.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: /Sign in & read/ }).closest('form')!);
  });
  await waitFor(() =>
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your purchased chapter'),
  );
  expect(screen.getByAltText('Purchased image').getAttribute('src')).toContain('/private.png');
  expect(screen.getByRole('button', { name: /Next chapter/ }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Password').getAttribute('value')).toBe('');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Return to preview/ }));
  });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Letters from the shore');
  expect(screen.queryByAltText('Purchased image')).toBeNull();
});
