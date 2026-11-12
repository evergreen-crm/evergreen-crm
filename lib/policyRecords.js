// Policy sign-off records, the witness review, the signed copies and the alerts around them. Server only:
// everything here uses the service key, so callers must check who is asking first.
//   * ensurePolicyRecord: when a person has signed every policy that applies to them, one record is made
//     and the witness for their house is told (Program Coordinator, then Program Manager, then directors).
//   * witnessPolicyRecord: the witness signs once; the one-page record is saved in the staff file and the
//     witness is stamped into each signed policy.
//   * remakeSignedCopy: makes a policy's signed copy again from what was saved (used for the witness stamp
//     and for signatures made before signed copies existed).
// supabase/policy-records.sql
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { buildPolicySignedPdf, buildPolicyRecordPdf, EMPLOYER } from '@/lib/policySignPdf';
import { sendEmail, emailReady } from '@/lib/email';
import { groupOf, groupName, levelOf, levelName } from '@/lib/levels';
import { appliesToProgram } from '@/lib/policyDue';

const SITE = (process.env.SITE_URL || 'https://evergreen-crm-azure.vercel.app').replace(/\/$/, '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'policy';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const positionOf = (profile) => groupName(groupOf(profile)) ?? levelName(levelOf(profile));
const isPdfVersion = (v) => v && (v.file_type === 'application/pdf' || /\.pdf$/i.test(v.file_name ?? v.file_path ?? ''));

// In-app alert for each person (once per key), with an email the first time.
export async function alertPeople(admin, people, { key, title, body, link, button = 'Open in the portal' }) {
  let sent = 0;
  for (const p of people ?? []) {
    if (!p?.id) continue;
    const { data: ins } = await admin.from('notifications')
      .upsert({ profile_id: p.id, title, body, link, dedupe_key: `${key}:${p.id}` }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select('id');
    if (!ins?.length) continue;
    sent++;
    if (p.email && p.email_alerts !== false && emailReady()) {
      try {
        await sendEmail({ to: p.email, subject: title,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2b24;font-size:15px;line-height:1.5"><p style="background:#0b5a34;color:#fff;padding:12px 16px;margin:0 0 16px"><strong>EVERGREEN</strong> COMMUNITY CARE</p><p>Hello ${esc((p.full_name ?? '').split(' ')[0] || 'there')},</p><p>${esc(body)}</p><p><a href="${SITE}${link}" style="background:#0b5a34;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block;font-weight:bold">${esc(button)}</a></p><p style="color:#6b7a72;font-size:12px">Automatic message from the Evergreen portal. Please don’t reply.</p></div>`,
          text: `${body}\n\n${SITE}${link}` });
      } catch { /* the in-app alert is already there */ }
    }
  }
  return sent;
}

// Everyone active, with what is needed to pick a house's leaders.
export async function loadPeople(admin) {
  const [{ data: profiles }, { data: mh }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, email_alerts, role, level, staff_group, home_id, active, created_at').eq('active', true),
    admin.from('manager_homes').select('profile_id, home_id'),
  ]);
  const extra = {};
  for (const r of mh ?? []) (extra[r.profile_id] ??= new Set()).add(r.home_id);
  return (profiles ?? []).filter((p) => p.role !== 'family').map((p) => ({ ...p, homes: new Set([p.home_id, ...(extra[p.id] ?? [])].filter(Boolean)) }));
}
const lead = (p) => !groupOf(p) && p.role !== 'admin';
// The leaders for one staff member: their house's Program Coordinators and Program Managers, and the directors.
export function leadersFor(person, people) {
  const above = (p) => p.id !== person.id && levelOf(p) > levelOf(person);
  const inHouse = (p) => person.home_id && p.homes.has(person.home_id);
  return {
    pcs: people.filter((p) => lead(p) && levelOf(p) === 2 && inHouse(p) && above(p)),
    pms: people.filter((p) => lead(p) && levelOf(p) === 3 && inHouse(p) && above(p)),
    directors: people.filter((p) => lead(p) && levelOf(p) >= 4 && levelOf(p) <= 7 && above(p)),
    admins: people.filter((p) => p.role === 'admin' && p.id !== person.id),
  };
}
// Who witnesses at each stage: 1 = the house's Program Coordinator and Program Manager together (whoever signs first),
// 3 = directors. An empty stage passes up.
export function witnessesAt(person, people, stage) {
  const L = leadersFor(person, people);
  const order = [[...L.pcs, ...L.pms], [], L.directors, L.admins];
  for (let i = Math.max(0, stage - 1); i < order.length; i++) if (order[i].length) return { who: order[i], stage: Math.min(3, i + 1) };
  return { who: [], stage: 3 };
}

// The policies a person must sign (current PDF versions that apply to their program), with their signatures.
export async function requiredFor(admin, profileId) {
  const [{ data: person }, { data: det }, { data: policies }, { data: acks }] = await Promise.all([
    admin.from('profiles').select('id, full_name, role, level, staff_group, home_id, active, homes(name)').eq('id', profileId).maybeSingle(),
    admin.from('staff_details').select('program, employee_no').eq('profile_id', profileId).maybeSingle(),
    admin.from('policies').select('id, title, code, applies_to, current_version_id').eq('active', true).eq('require_signature', true).not('current_version_id', 'is', null),
    admin.from('policy_acks').select('id, policy_id, policy_version_id, signed_at, signed_name, signature_image, finished_path').eq('profile_id', profileId),
  ]);
  if (!person) return null;
  const mine = (policies ?? []).filter((p) => appliesToProgram(p.applies_to, det?.program));
  const { data: versions } = mine.length
    ? await admin.from('policy_versions').select('id, version_label, file_path, file_name, file_type').in('id', mine.map((p) => p.current_version_id)) : { data: [] };
  const vById = Object.fromEntries((versions ?? []).map((v) => [v.id, v]));
  const items = mine.filter((p) => isPdfVersion(vById[p.current_version_id])).map((p) => ({
    policy: p, version: vById[p.current_version_id], ack: (acks ?? []).find((a) => a.policy_version_id === p.current_version_id) ?? null,
  })).sort((a, b) => String(a.policy.code ?? a.policy.title).localeCompare(String(b.policy.code ?? b.policy.title)));
  return { person, details: det ?? {}, items };
}

const event = (admin, recordId, ev, by, detail) => admin.from('policy_record_events').insert({ record_id: recordId, event: ev, by_profile: by ?? null, detail: detail ?? null });

// Makes the sign-off record once everything is signed (or retires one that no longer matches). Safe to call any time.
export async function ensurePolicyRecord(admin, profileId, people) {
  const req = await requiredFor(admin, profileId);
  if (!req || !req.person.active || req.person.role === 'admin' || req.person.role === 'family') return { status: 'not-applicable' };
  const done = req.items.length > 0 && req.items.every((i) => i.ack);
  const key = done ? sha(Buffer.from(req.items.map((i) => i.version.id).sort().join(','))).slice(0, 24) : null;
  const { data: open } = await admin.from('policy_records').select('id, items_key, status').eq('profile_id', profileId).in('status', ['awaiting_witness', 'witnessed']).order('created_at', { ascending: false });
  const latest = open?.[0];
  if (done && latest?.items_key === key) return { status: 'exists', id: latest.id };
  // A waiting record that no longer matches (a policy changed) is retired; a witnessed one stays as history.
  for (const r of (open ?? []).filter((x) => x.status === 'awaiting_witness')) {
    await admin.from('policy_records').update({ status: 'superseded' }).eq('id', r.id);
    await event(admin, r.id, 'superseded', null, 'A policy changed, so the list of signed policies is no longer complete.');
  }
  if (!done) return { status: 'incomplete', unsigned: req.items.filter((i) => !i.ack).length };

  const all = people ?? await loadPeople(admin);
  const person = all.find((p) => p.id === profileId) ?? { ...req.person, homes: new Set() };
  const { who, stage } = witnessesAt(person, all, 1);
  const items = req.items.map((i) => ({ policy_id: i.policy.id, version_id: i.version.id, ack_id: i.ack.id, code: i.policy.code ?? null, title: i.policy.title, version_label: i.version.version_label ?? null, signed_at: i.ack.signed_at }));
  const { data: rec, error } = await admin.from('policy_records').insert({ profile_id: profileId, items, items_key: key, stage }).select('id').single();
  if (error) return { status: 'error', error: error.message };
  await event(admin, rec.id, 'created', profileId, `${items.length} policies signed. Sent to: ${who.map((w) => w.full_name).join(', ') || 'nobody found'}.`);
  await alertPeople(admin, who, { key: `polrec:${rec.id}:s${stage}`, title: `Witness review needed: ${req.person.full_name} signed every policy`,
    body: `${req.person.full_name} has signed all ${items.length} policies. Please open the record, check the signed copies and sign once as witness. It is part of the audit file.`,
    link: `/policies/records/${rec.id}`, button: 'Review and sign as witness' });
  return { status: 'created', id: rec.id };
}

// Makes one policy's signed copy again from what was saved. witness: { name, role, at, image } or null.
export async function remakeSignedCopy(admin, ackId, { witness = null } = {}) {
  const { data: a } = await admin.from('policy_acks').select('*').eq('id', ackId).maybeSingle();
  if (!a) return { error: 'That signature was not found.' };
  const [{ data: pol }, { data: ver }, { data: person }] = await Promise.all([
    admin.from('policies').select('id, title, code').eq('id', a.policy_id).maybeSingle(),
    admin.from('policy_versions').select('id, version_label, effective_date, file_path, file_name, file_type, fields').eq('id', a.policy_version_id).maybeSingle(),
    admin.from('profiles').select('id, full_name, role, level, staff_group').eq('id', a.profile_id).maybeSingle(),
  ]);
  if (!pol || !ver || !person) return { error: 'The policy or the person is no longer in the records.' };
  if (!isPdfVersion(ver)) return { error: 'That version is not a PDF, so a signed copy can’t be made.' };
  const { data: file, error: dlErr } = await admin.storage.from('policies').download(ver.file_path);
  if (dlErr || !file) return { error: 'Could not open the policy document.' };
  const fileBytes = Buffer.from(await file.arrayBuffer());
  let bytes;
  try {
    bytes = Buffer.from(await buildPolicySignedPdf({
      fileBytes, fields: a.field_values ? (Array.isArray(ver.fields) ? ver.fields : []) : [], policy: pol, version: { ...ver, file_sha256: sha(fileBytes) },
      ack: { id: a.id, signed_at: a.signed_at, signed_name: a.signed_name }, staffName: person.full_name, position: positionOf(person),
      signatureImage: a.signature_image, values: a.field_values ?? {}, witness,
    }));
  } catch (e) { return { error: `The signed copy could not be made: ${e?.message ?? e}` }; }
  const hash = sha(bytes);
  const path = `${a.profile_id}/paperwork/${new Date(a.signed_at).toISOString().slice(0, 10)}-policy-${slug(pol.code || pol.title)}-${randomUUID().slice(0, 8)}.pdf`;
  const up = await admin.storage.from('staff-files').upload(path, bytes, { contentType: 'application/pdf' });
  if (up.error) return { error: 'The signed copy could not be saved: ' + up.error.message };
  const patch = { finished_path: path, finished_hash: hash, ...(witness ? { witnessed_by: witness.id ?? null, witnessed_name: witness.name, witnessed_at: new Date(witness.at).toISOString() } : {}) };
  const { error } = await admin.from('policy_acks').update(patch).eq('id', a.id);
  if (error) { await admin.storage.from('staff-files').remove([path]); return { error: error.message }; }
  const title = `Policy signed: ${pol.title}${ver.version_label ? ` v${ver.version_label}` : ''}`.slice(0, 300);
  const { data: row } = await admin.from('paperwork_pdfs').update({ file_path: path, sha256: hash, onedrive_status: 'waiting' }).eq('kind', 'signed').eq('source_id', `policy:${a.id}`).select('id');
  if (!row?.length) await admin.from('paperwork_pdfs').insert({ profile_id: a.profile_id, kind: 'signed', title, source_id: `policy:${a.id}`, file_path: path, sha256: hash });
  if (a.finished_path && a.finished_path !== path) await admin.storage.from('staff-files').remove([a.finished_path]);
  return { ok: true, path };
}

// The witness signs the record. `witness` is the signed-in leader's profile (already checked by the caller).
export async function witnessPolicyRecord(admin, recordId, witness, { name, image }) {
  const { data: rec } = await admin.from('policy_records').select('*').eq('id', recordId).maybeSingle();
  if (!rec) return { error: 'That record was not found.' };
  if (rec.status !== 'awaiting_witness') return { error: rec.status === 'witnessed' ? 'This record has already been witnessed.' : 'This record was replaced because a policy changed. Open the newer record.' };
  const [{ data: person }, { data: det }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, email_alerts, role, level, staff_group, homes(name)').eq('id', rec.profile_id).maybeSingle(),
    admin.from('staff_details').select('employee_no').eq('profile_id', rec.profile_id).maybeSingle(),
  ]);
  if (!person) return { error: 'The staff member is no longer in the records.' };
  const items = Array.isArray(rec.items) ? rec.items : [];
  const { data: acks } = await admin.from('policy_acks').select('id, signature_image, signed_at').in('id', items.map((i) => i.ack_id));
  const staffSig = (acks ?? []).filter((a) => a.signature_image).sort((x, y) => (x.signed_at < y.signed_at ? 1 : -1))[0]?.signature_image ?? null;
  const at = new Date();
  const w = { id: witness.id, name: name.trim(), role: positionOf(witness), at, image };
  let bytes;
  try {
    bytes = Buffer.from(await buildPolicyRecordPdf({ recordId: rec.id, staffName: person.full_name, position: positionOf(person), house: person.homes?.name ?? '-', employeeNo: det?.employee_no ?? '-', items, witness: w, staffSignature: staffSig }));
  } catch (e) { return { error: `The record could not be made, so nothing was saved: ${e?.message ?? e}` }; }
  const hash = sha(bytes);
  const path = `${rec.profile_id}/paperwork/${at.toISOString().slice(0, 10)}-policy-sign-off-record-${rec.id.slice(0, 8)}.pdf`;
  const up = await admin.storage.from('staff-files').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) return { error: 'The record could not be saved, so nothing was signed: ' + up.error.message };
  // Only one witness wins if two people press at once.
  const { data: won, error } = await admin.from('policy_records').update({
    status: 'witnessed', witnessed_by: witness.id, witnessed_name: w.name, witnessed_role: w.role, witnessed_at: at.toISOString(), witness_signature: image, file_path: path, file_sha256: hash,
  }).eq('id', rec.id).eq('status', 'awaiting_witness').select('id');
  if (error || !won?.length) return { error: error?.message ?? 'Someone else has just witnessed this record.' };
  await admin.from('paperwork_pdfs').upsert({ profile_id: rec.profile_id, kind: 'signed', title: `Policy sign-off record (witnessed by ${w.name})`.slice(0, 300), source_id: `policy-record:${rec.id}`, file_path: path, sha256: hash }, { onConflict: 'kind,source_id' });
  // Stamp the witness into each signed policy. A copy that can't be remade keeps its unwitnessed copy.
  let stamped = 0; const failed = [];
  for (const it of items) {
    const r = await remakeSignedCopy(admin, it.ack_id, { witness: w });
    if (r.ok) stamped++; else failed.push(`${it.code ?? it.title}: ${r.error}`);
  }
  await event(admin, rec.id, 'witnessed', witness.id, `${w.name} (${w.role}). Witness added to ${stamped} of ${items.length} signed policies.${failed.length ? ` Not added: ${failed.join('; ')}` : ''}`);
  await admin.from('action_items').update({ status: 'Closed', closed_at: at.toISOString(), closed_note: `Witnessed by ${w.name}.` }).eq('source_key', `polrec:${rec.id}`).eq('status', 'Open');
  await alertPeople(admin, [person], { key: `polrec:${rec.id}:done`, title: 'Your policy sign-off is complete', body: `${w.name} (${w.role}) reviewed and witnessed your signed policies. The record is in your staff file.`, link: `/policies/records/${rec.id}`, button: 'Open my record' });
  return { ok: true, stamped, failed, employer: EMPLOYER };
}
