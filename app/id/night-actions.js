'use server';
// Night checks (supabase/night-checks.sql): the staff member taps "Night check" at the house.
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export async function nightCheckIn({ loc }) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { data, error } = await supabase.rpc('night_check_in', {
    p_lat: num(loc?.lat), p_lng: num(loc?.lng), p_acc: loc?.accuracy != null ? Math.round(loc.accuracy) : null,
  });
  if (error) return { error: (error.message ?? 'Could not save the check.').replace(/^.*?ERROR:\s*/, '') };
  revalidatePath('/id');
  return { ...data, user: user.id };
}
