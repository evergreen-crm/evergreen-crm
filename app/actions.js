'use server';
// Everything that SAVES data. Each action runs on the server.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { roleForLevel, levelName, needsHome, parseAccess, groupName } from '@/lib/levels';

const text = (formData, key) => {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

function cleanPhone(value) {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits;
  return '+' + digits;
}

// ---------------- Shift notes ----------------

export async function addShiftNote(formData) {
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const residentId = text(formData, 'resident_id');
  const signNow = formData.get('sign') === 'yes';

  const { error } = await supabase.from('shift_notes').insert({
    resident_id: residentId,
    author_id: user.id,
    shift: text(formData, 'shift'),
    mood: text(formData, 'mood'),
    meals: text(formData, 'meals'),
    activities: text(formData, 'activities'),
    note: text(formData, 'note'),
    share_with_family: formData.get('share_with_family') === 'on',
    signed_at: signNow ? new Date().toISOString() : null,
  });
  if (error) throw new Error('Could not save note: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}

export async function signShiftNote(formData) {
  const { supabase } = await requireUser(['admin', 'manager', 'staff']);
  const noteId = text(formData, 'note_id');
  const residentId = text(formData, 'resident_id');
  const { error } = await supabase
    .from('shift_notes')
    .update({ signed_at: new Date().toISOString() })
    .eq('id', noteId);
  if (error) throw new Error('Could not sign note: ' + error.message);
  revalidatePath(`/residents/${residentId}`);
}

// ---------------- Admin: homes & residents ----------------

export async function addHome(formData) {
  const { supabase } = await requireUser(['admin']);
  const { error } = await supabase.from('homes').insert({
    name: text(formData, 'name'),
    address: text(formData, 'address'),
    licence_number: text(formData, 'licence_number'),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function addResident(formData) {
  const { supabase } = await requireUser(['admin', 'manager']);
  const { error } = await supabase.from('residents').insert({
    home_id: text(formData, 'home_id'),
    first_name: text(formData, 'first_name'),
    last_name: text(formData, 'last_name'),
    date_of_birth: text(formData, 'date_of_birth'),
    admission_date: text(formData, 'admission_date'),
    allergies: text(formData, 'allergies'),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  revalidatePath('/');
}

// ---------------- Admin: give each person access ----------------

export async function inviteUser(formData) {
  // 1. Only an admin may do this (checked with THEIR login, not the secret key).
  await requireUser(['admin']);

  const fullName = text(formData, 'full_name');
  const email = text(formData, 'email')?.toLowerCase() ?? null;
  const phone = cleanPhone(text(formData, 'phone'));
  // "level" is 1-8 (staff levels) or "family". Older forms may still send "role".
  const levelChoice = text(formData, 'level') ?? text(formData, 'role');
  const isFamily = levelChoice === 'family';
  const legacy = { admin: 8, manager: 3, staff: 1 };
  const access = isFamily ? null : parseAccess(String(legacy[levelChoice] ?? levelChoice));
  const level = access?.level ?? null;
  const group = access?.group ?? null;
  const role = isFamily ? 'family' : roleForLevel(level);
  const homeId = text(formData, 'home_id');
  const residentId = text(formData, 'resident_id');

  if (!fullName || (!email && !phone)) {
    redirect('/admin?error=' + encodeURIComponent('Name and an email or cell number are required.'));
  }
  if (!isFamily && !access) {
    redirect('/admin?error=' + encodeURIComponent('Choose an access level.'));
  }
  if (!isFamily && needsHome(level, group) && !homeId) {
    redirect('/admin?error=' + encodeURIComponent(`Pick a home for ${levelName(level)} staff.`));
  }
  if (role === 'family' && !residentId) {
    redirect('/admin?error=' + encodeURIComponent('Pick the resident this family member may see.'));
  }

  const admin = createAdminClient();

  // 2. Create the login account. They prove they own the email/phone
  //    every time they sign in, by entering the code we send there.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: email ?? undefined,
    phone: phone ?? undefined,
    email_confirm: !!email,
    phone_confirm: !!phone,
    user_metadata: { full_name: fullName },
  });
  if (createError) {
    redirect('/admin?error=' + encodeURIComponent('Could not add user: ' + createError.message));
  }

  const userId = created.user.id;

  // 3. Their profile = role + home.
  const profileRow = {
    id: userId,
    full_name: fullName,
    email,
    phone,
    role,
    level,
    home_id: !group && (role === 'staff' || role === 'manager') ? homeId : null,
    ...(group ? { staff_group: group } : {}),
  };
  let { error: profileError } = await admin.from('profiles').insert(profileRow);
  if (profileError && /level/.test(profileError.message)) {
    // supabase/access-levels.sql not run yet: save without the level.
    delete profileRow.level;
    ({ error: profileError } = await admin.from('profiles').insert(profileRow));
  }
  if (profileError) {
    await admin.auth.admin.deleteUser(userId); // undo half-made account
    redirect('/admin?error=' + encodeURIComponent('Could not save profile: ' + profileError.message));
  }

  // 4. Family: link to their one resident.
  if (role === 'family') {
    await admin.from('family_links').insert({
      family_id: userId,
      resident_id: residentId,
      relationship: text(formData, 'relationship'),
    });
  }

  revalidatePath('/admin');
  redirect('/admin?ok=' + encodeURIComponent(`${fullName} can now sign in with a code.`));
}

// Turn access off (or back on) instantly. Accounts are never deleted,
// so the audit trail stays complete.
export async function setUserActive(formData) {
  const { user } = await requireUser(['admin']);
  const userId = text(formData, 'user_id');
  const active = formData.get('active') === 'true';
  if (userId === user.id) {
    redirect('/admin?error=' + encodeURIComponent("You can't turn off your own account."));
  }

  const admin = createAdminClient();
  await admin.from('profiles').update({ active }).eq('id', userId);
  // Ban = they are logged out and can't get new codes. ~100 years.
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : '876000h' });

  revalidatePath('/admin');
}

// Move a person to another access level (their security level) and/or home.
export async function setUserLevel(formData) {
  const { supabase, user } = await requireUser(['admin']);
  const userId = text(formData, 'user_id');
  const access = parseAccess(text(formData, 'level'));
  if (!access) redirect('/admin?error=' + encodeURIComponent('Choose a level from 1 to 8, HR or Payroll.'));
  const { level, group } = access;
  const homeId = group ? null : text(formData, 'home_id');
  if (userId === user.id && level < 8) {
    redirect('/admin?error=' + encodeURIComponent("You can't lower your own level — ask another Administrator."));
  }
  if (needsHome(level, group) && !homeId) {
    redirect('/admin?error=' + encodeURIComponent(`Pick a home for ${levelName(level)} staff.`));
  }
  // Signed in as the admin: the database rules check this is allowed.
  const { error } = await supabase.from('profiles')
    .update({ level, role: roleForLevel(level), home_id: homeId, staff_group: group })
    .eq('id', userId);
  if (error) redirect('/admin?error=' + encodeURIComponent('Could not change level: ' + (/staff_group/.test(error.message) ? 'run supabase/staff-groups.sql in Supabase first.' : error.message)));
  revalidatePath('/admin');
  redirect('/admin?ok=' + encodeURIComponent(group ? `Moved to ${groupName(group)}.` : `Moved to level ${level} · ${levelName(level)}.`) + '#people');
}

// Which level opens each portal division (view + add) and lets people edit everyone's records.
export async function setDivisionLevels(formData) {
  const { supabase } = await requireUser(['admin']);
  const rows = [];
  for (const [k, v] of formData.entries()) {
    const m = /^view_(.+)$/.exec(k);
    if (!m) continue;
    const view = Number(v), edit = Math.max(view, Number(formData.get('edit_' + m[1]) || view));
    if (view >= 1 && view <= 8) rows.push({ division: m[1], view_level: view, edit_level: Math.min(edit, 8), updated_at: new Date().toISOString() });
  }
  const { error } = await supabase.from('division_levels').upsert(rows);
  if (error) redirect('/admin?error=' + encodeURIComponent('Could not save division levels: ' + error.message + ' (run supabase/access-levels.sql first)'));
  revalidatePath('/admin');
  revalidatePath('/portal');
  redirect('/admin?ok=' + encodeURIComponent('Division access by level saved.') + '#divisions');
}
