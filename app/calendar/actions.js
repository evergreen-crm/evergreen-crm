'use server';
// Calendar: saving appointments.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export async function addAppointment(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const row = {
    home_id: text(formData, 'home_id'),
    resident_id: text(formData, 'resident_id'),
    title: text(formData, 'title'),
    category: text(formData, 'category') ?? 'Other',
    appt_date: text(formData, 'appt_date'),
    start_time: text(formData, 'start_time'),
    end_time: text(formData, 'end_time'),
    location: text(formData, 'location'),
    notes: text(formData, 'notes'),
    share_with_family: formData.get('share_with_family') === 'on',
  };
  const { error } = await supabase.from('appointments').insert(row);
  if (error) throw new Error('Could not add appointment: ' + error.message);
  revalidatePath('/calendar');
  const back = text(formData, 'back') ?? `/calendar?home=${row.home_id}&d=${row.appt_date}`;
  redirect(back);
}

export async function setAppointmentStatus(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('appointments')
    .update({ status: text(formData, 'status') }).eq('id', text(formData, 'id'));
  if (error) throw new Error(error.message);
  revalidatePath('/calendar');
}
