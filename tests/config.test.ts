import { describe, it, expect } from 'vitest';
import { validPublicConfig } from '../src/lib/public-config';
const legacy = (role: string) => 'header.' + btoa(JSON.stringify({ role })) + '.signature';
describe('public-only configuration', () => {
  it('accepts hosted publishable and legacy anon keys', () => {
    expect(validPublicConfig('https://project.supabase.co', 'sb_publishable_example')).toBe(true);
    expect(validPublicConfig('https://project.supabase.co', legacy('anon'))).toBe(true);
  });
  it('accepts local development HTTP', () => {
    expect(validPublicConfig('http://127.0.0.1:54321', 'sb_publishable_example')).toBe(true);
  });
  it.each(['sb_secret_example', legacy('service_role'), legacy('authenticated'), 'broken'])(
    'refuses secret or invalid key: %s',
    (key) => {
      expect(validPublicConfig('https://project.supabase.co', key)).toBe(false);
    },
  );
  it('refuses missing config, invalid URLs and nonlocal HTTP', () => {
    expect(validPublicConfig(undefined, undefined)).toBe(false);
    expect(validPublicConfig('invalid', 'sb_publishable_example')).toBe(false);
    expect(validPublicConfig('http://project.supabase.co', 'sb_publishable_example')).toBe(false);
  });
});
