import 'server-only';
import type { Database } from '@/lib/database.types';
import { createClient } from '@supabase/supabase-js';
import { validPublicConfig } from '@/lib/public-config';
import { panelPipeline } from '@/lib/panel-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!validPublicConfig(url, key))
    return Response.json(
      { error: 'Reading service is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } },
    );
  // Publishable/anon key + the caller's bearer token keeps PostgREST AND Storage
  // under the same user's RLS. There is no secret/service-role key in this app.
  const client = createClient<Database>(url!, key!, {
    global: {
      headers: { Authorization: request.headers.get('authorization') ?? '' },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: 'no-store',
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
        }),
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return panelPipeline(request, (await context.params).chapterId, client);
}
