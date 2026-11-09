/** Configuration guard, not token authentication. Supabase verifies credentials. */
export function validPublicConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' &&
      !(parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname))
    )
      return false;
    if (key.startsWith('sb_publishable_')) return true;
    // Legacy anon JWTs are still supported, but never secret/service-role keys.
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
