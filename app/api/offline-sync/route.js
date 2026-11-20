// Offline notes (plan B3): the device sends the notes it kept while the internet was down.
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { syncItem } from '@/lib/offlineSync';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { supabase, user, profile } = await getCurrentUser();
  if (!user || !profile?.active) return Response.json({ error: 'Sign in again to upload your notes.' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const items = Array.isArray(body?.items) ? body.items.slice(0, 50) : [];
  const results = [];
  for (const it of items) {
    if (it?.userId !== user.id) { results.push({ id: it?.id, ok: false, skip: true }); continue; }
    try { results.push({ id: it.id, ...(await syncItem(supabase, user.id, it)) }); }
    catch (e) { results.push({ id: it.id, ok: false, error: String(e?.message ?? e) }); }
  }
  if (results.some((r) => r.ok)) { revalidatePath('/notes'); revalidatePath('/documentation'); revalidatePath('/portal'); }
  return Response.json({ results });
}
