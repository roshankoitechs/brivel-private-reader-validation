import type { PanelManifest } from './panel-contract';
import type { Database } from './database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const URL_TTL_SECONDS = 120;
export const PRIVATE_BUCKET = 'comic-panels';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Vary: 'Authorization',
  'Referrer-Policy': 'no-referrer',
};
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

/** A new user-scoped Supabase client per request; NEVER pass a service client. */
export async function panelPipeline(
  request: Request,
  chapterId: string,
  client: SupabaseClient<Database>,
) {
  if (!UUID.test(chapterId)) return json({ error: 'Invalid chapter ID.' }, 400);
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match || match[1].length > 8192)
    return json({ error: 'Sign in to read this chapter.' }, 401);
  try {
    // Verify with Auth; do not trust decoded JWTs or a client-supplied user ID.
    const { data: auth, error: authError } = await client.auth.getUser(match[1]);
    if (authError && ![400, 401, 403].includes(authError.status ?? 0))
      return json({ error: 'Authentication service is temporarily unavailable.' }, 503);
    if (authError || !auth.user || auth.user.is_anonymous)
      return json({ error: 'Sign in to read this chapter.' }, 401);

    // RLS independently scopes both this query and the Storage signing call.
    const { data: rows, error: readError } = await client
      .from('chapter_panels')
      .select('id,position,object_path,alt_text,width,height')
      .eq('chapter_id', chapterId)
      .order('position')
      .limit(51);
    if (readError) return json({ error: 'Unable to load this chapter. Please retry.' }, 503);
    const panels = rows;
    // Same result for nonexistent, unpaid, refunded and revoked chapters.
    if (!panels?.length) return json({ error: 'Chapter unavailable or access not granted.' }, 404);
    if (panels.length > 50) return json({ error: 'Chapter configuration is invalid.' }, 503);
    const issuedAt = Date.now();
    const { data: signed, error: signError } = await client.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrls(
        panels.map((p) => p.object_path),
        URL_TTL_SECONDS,
      );
    if (
      signError ||
      !signed ||
      signed.length !== panels.length ||
      signed.some((s) => s.error || !s.signedUrl || !s.path)
    ) {
      return json({ error: 'Unable to prepare chapter images. Please retry.' }, 503);
    }
    const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
    if (panels.some((p) => !byPath.has(p.object_path)))
      return json({ error: 'Unable to prepare chapter images. Please retry.' }, 503);
    return json({
      panels: panels.map(({ object_path, ...panel }) => ({
        ...panel,
        url: byPath.get(object_path)!,
      })),
      expiresIn: URL_TTL_SECONDS,
      // Conservative refresh hint, not a replacement for Storage's token expiry.
      refreshAfter: new Date(issuedAt + 105_000).toISOString(),
    } satisfies PanelManifest);
  } catch {
    // Never log bearer tokens, paths, signed URLs or provider response bodies.
    return json({ error: 'Reading service is temporarily unavailable.' }, 503);
  }
}
