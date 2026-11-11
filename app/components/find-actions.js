'use server';
// 🔍 Find: remember a search that found nothing (supabase/find-misses.sql). Best effort, never shown to the person.
import { requireUser } from '@/lib/auth';

export async function logFindMiss(q) {
  try {
    const { supabase } = await requireUser(['admin', 'manager', 'staff']);
    const text = String(q ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (text.length < 3) return { ok: false };
    await supabase.rpc('log_find_miss', { p_q: text });
    return { ok: true };
  } catch { return { ok: false }; }
}
