'use server';
// Staff onboarding: sending the request, filling in, signing, reviewing, certificates.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { SECTIONS, templateFor } from '@/lib/onboarding';
import { addDaysISO, todayISO } from '@/lib/options';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
const BOSS = ['admin', 'manager'];
const refreshFor = (profileId) => { revalidatePath('/onboarding'); revalidatePath(`/hr/${profileId}`); revalidatePath(`/hr/${profileId}/onboarding`); };

function addMonths(iso, n) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10);
}

// ---------- Manager: send the onboarding request ----------
export async function startOnboarding(formData) {
  const { supabase, user } = await requireUser(BOSS);
  const profileId = text(formData, 'profile_id');
  const hire = text(formData, 'hire_date') ?? todayISO();
  const { data: onb, error } = await supabase.from('onboardings').insert({
    profile_id: profileId, hire_date: hire, due_date: addDaysISO(hire, 30), sent_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.code === '23505' ? 'This person already has an onboarding checklist.' : 'Could not start onboarding: ' + error.message);

  const rows = [];
  for (const s of SECTIONS) s.items.forEach((it, i) => rows.push({
    onboarding_id: onb.id, profile_id: profileId, section: s.key, item_key: it.key, title: it.title,
    sort: i, due_date: addDaysISO(hire, it.days ?? 30),
    status: it.kind === 'manager' ? 'To do' : 'To do',
  }));
  const { error: e2 } = await supabase.from('onboarding_items').insert(rows);
  if (e2) throw new Error('Could not create checklist: ' + e2.message);
  await supabase.from('staff_details').upsert({ profile_id: profileId, hire_date: hire, updated_at: new Date().toISOString() });
  refreshFor(profileId);
  redirect(`/hr/${profileId}/onboarding`);
}

// ---------- Staff: personal information and signature ----------
export async function savePersonal(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const keys = ['legal_name', 'preferred_name', 'pronouns', 'phone', 'address', 'city', 'postal_code',
    'emergency_name', 'emergency_relationship', 'emergency_phone', 'languages'];
  const personal = Object.fromEntries(keys.map((k) => [k, text(formData, k)]).filter(([, v]) => v));
  const { error } = await supabase.from('onboardings').update({ personal, status: 'In progress' })
    .eq('profile_id', user.id).neq('status', 'Complete');
  if (error) throw new Error('Could not save: ' + error.message);
  if (personal.emergency_name) {
    await supabase.from('staff_details').update({
      emergency_contact: `${personal.emergency_name}${personal.emergency_relationship ? ` (${personal.emergency_relationship})` : ''}`,
      emergency_phone: personal.emergency_phone ?? null,
    }).eq('profile_id', user.id);
  }
  refreshFor(user.id);
}

export async function saveSignature(dataUrl) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 300000) {
    return { error: 'Please draw your signature again.' };
  }
  const { error } = await supabase.from('onboardings').update({ signature_image: dataUrl }).eq('profile_id', user.id);
  if (error) return { error: error.message };
  refreshFor(user.id);
  return { ok: true };
}

// ---------- Staff: fill in / sign one item ----------
export async function submitItem(formData) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const id = text(formData, 'id');
  const { data: item } = await supabase.from('onboarding_items').select('*, onboardings(signature_image)').eq('id', id).maybeSingle();
  if (!item || item.profile_id !== user.id) throw new Error('This is not your checklist item.');
  const tpl = templateFor(item.item_key);
  const data = { ...(item.data ?? {}) };
  const patch = { status: 'Submitted' };

  if (tpl.kind === 'sign') {
    if (formData.get('agree') !== 'on') throw new Error('Please tick the box to confirm you agree.');
    const typed = text(formData, 'signed_name') ?? '';
    if (typed.toLowerCase().replace(/\s+/g, ' ') !== (profile.full_name ?? '').toLowerCase().replace(/\s+/g, ' ')) {
      throw new Error(`Type your full name exactly as "${profile.full_name}" to sign.`);
    }
    if (!item.onboardings?.signature_image) throw new Error('Please draw your signature at the top of the page first.');
    patch.signed_name = typed;
  } else if (tpl.kind === 'refs') {
    for (const k of ['r1_name', 'r1_phone', 'r1_relationship', 'r2_name', 'r2_phone', 'r2_relationship']) data[k] = text(formData, k);
    if (!data.r1_name || !data.r1_phone || !data.r2_name || !data.r2_phone) throw new Error('Please give two references with phone numbers.');
  } else if (tpl.kind === 'declare') {
    data.fit = text(formData, 'fit');
    data.accommodations = text(formData, 'accommodations');
    if (!data.fit) throw new Error('Please answer the question.');
  } else if (tpl.kind === 'upload') {
    data.date = text(formData, 'date');
    data.notes = text(formData, 'notes');
    if (!item.file_path) throw new Error('Please upload the file first.');
  } else if (tpl.kind === 'training') {
    data.completed_on = text(formData, 'completed_on');
    data.provider = text(formData, 'provider');
    data.hours = text(formData, 'hours');
    data.expires_on = text(formData, 'expires_on');
    data.notes = text(formData, 'notes');
    if (!data.completed_on) throw new Error('Please enter the date you completed the training.');
  } else {
    throw new Error('Your manager completes this item.');
  }
  patch.data = data;
  const { error } = await supabase.from('onboarding_items').update(patch).eq('id', id);
  if (error) throw new Error('Could not save: ' + error.message);
  await supabase.from('onboardings').update({ status: 'In progress' }).eq('profile_id', user.id).eq('status', 'Sent');
  refreshFor(user.id);
}

export async function attachItemFile(itemId, path) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  if (!path?.startsWith(user.id + '/')) return { error: 'Wrong folder.' };
  const { error } = await supabase.from('onboarding_items').update({ file_path: path }).eq('id', itemId).eq('profile_id', user.id);
  if (error) return { error: error.message };
  refreshFor(user.id);
  return { ok: true };
}

export async function submitOnboarding() {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const { error } = await supabase.from('onboardings').update({ status: 'Submitted' }).eq('profile_id', user.id);
  if (error) throw new Error('Could not submit: ' + error.message);
  refreshFor(user.id);
}

// ---------- Manager: review ----------
export async function reviewItem(formData) {
  const { supabase, user } = await requireUser(BOSS);
  const id = text(formData, 'id');
  const decision = text(formData, 'decision');
  const { data: item } = await supabase.from('onboarding_items').select('*').eq('id', id).maybeSingle();
  if (!item) throw new Error('Item not found.');
  const tpl = templateFor(item.item_key);
  const patch = { reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: text(formData, 'note') };

  if (decision === 'verify') {
    patch.status = 'Verified';
    const d = { ...(item.data ?? {}) };
    if (tpl?.kind === 'manager') d.date = text(formData, 'date') ?? todayISO();
    if (tpl?.kind === 'training') {
      // Managers can also record in-house training directly.
      d.completed_on = d.completed_on ?? text(formData, 'completed_on') ?? todayISO();
      d.provider = d.provider ?? tpl.provider;
      const expires = d.expires_on ?? (tpl.renewMonths ? addMonths(d.completed_on, tpl.renewMonths) : null);
      if (!item.training_id) {
        const { data: tr, error: te } = await supabase.from('trainings').insert({
          profile_id: item.profile_id, title: tpl.title, completed_on: d.completed_on,
          hours: d.hours ? Number(d.hours) : null, provider: d.provider, expires_on: expires,
          notes: d.notes ?? null, verified_by: user.id, created_by: user.id,
        }).select('id').single();
        if (te) throw new Error('Could not create training record: ' + te.message);
        const certNo = `ECC-${d.completed_on.slice(0, 4)}-${tr.id.slice(0, 6).toUpperCase()}`;
        await supabase.from('trainings').update({ certificate_no: certNo }).eq('id', tr.id);
        patch.training_id = tr.id;
        if (expires) {
          await supabase.from('certifications').insert({
            profile_id: item.profile_id, cert_type: tpl.title, issued_on: d.completed_on, expires_on: expires,
            notes: `Certificate ${certNo}${d.provider ? ` · ${d.provider}` : ''}`, created_by: user.id,
          });
        }
      }
    }
    if (item.item_key === 'crc') {
      const issued = d.date ?? todayISO();
      await supabase.from('certifications').insert({
        profile_id: item.profile_id, cert_type: 'Criminal Record Check (incl. Vulnerable Sector)',
        issued_on: issued, expires_on: addMonths(issued, 60), notes: 'From onboarding', created_by: user.id,
      });
    }
    patch.data = d;
  } else if (decision === 'return') {
    patch.status = 'Returned';
    if (!patch.review_note) throw new Error('Please write a note so they know what to fix.');
  } else if (decision === 'na') {
    patch.status = 'N/A';
  } else if (decision === 'reopen') {
    patch.status = 'To do';
  }
  const { error } = await supabase.from('onboarding_items').update(patch).eq('id', id);
  if (error) throw new Error('Could not save review: ' + error.message);
  refreshFor(item.profile_id);
}

export async function completeOnboarding(formData) {
  const { supabase, user } = await requireUser(BOSS);
  const profileId = text(formData, 'profile_id');
  const { error } = await supabase.from('onboardings')
    .update({ status: 'Complete', completed_by: user.id, completed_at: new Date().toISOString() }).eq('profile_id', profileId);
  if (error) throw new Error('Could not complete: ' + error.message);
  refreshFor(profileId);
}
