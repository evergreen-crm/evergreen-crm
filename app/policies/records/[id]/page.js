// One policy sign-off record: every policy the person signed, links to each signed copy, and the witness's signature.
// Seen by the person, their house leaders, HR, directors and the Administrator (the database checks).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createAdminClient, adminKey } from '@/lib/supabase/admin';
import { fmtDate, fmtDateTime } from '@/lib/options';
import { WITNESS_DAYS } from '@/lib/policyDue';
import { canHR, levelOf } from '@/lib/levels';
import WitnessForm from '../WitnessForm';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;   // witnessing remakes each signed policy with the witness added
export const metadata = { title: 'Policy sign-off record · Evergreen' };
const STAGE = { 1: 'Program Coordinator and Program Manager', 2: 'Program Manager', 3: 'Directors' };

export default async function PolicyRecord({ params }) {
  const { id } = await params;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const { data: r } = await supabase.from('policy_records').select('*, person:profile_id(full_name, homes(name))').eq('id', id).maybeSingle();
  if (!r) notFound();
  const mine = r.profile_id === user.id;
  const [{ data: canWitness }, { data: events }] = await Promise.all([
    supabase.rpc('can_witness_policy_record', { p: r.profile_id }),
    supabase.from('policy_record_events').select('id, at, event, detail').eq('record_id', id).order('at'),
  ]);
  const items = Array.isArray(r.items) ? r.items : [];
  // Links to the signed copies and the record (the viewer was already allowed to see this record).
  const links = {}; let recordUrl = null;
  // Frontline staff can't reopen their own signed policies (they use the binder in the house).
  const lockedForMe = mine && profile.role !== 'admin' && !canHR(profile) && levelOf(profile) < 2;
  if (adminKey() && !lockedForMe) {
    const admin = createAdminClient();
    const { data: acks } = await admin.from('policy_acks').select('id, finished_path').in('id', items.map((i) => i.ack_id));
    for (const a of acks ?? []) {
      if (!a.finished_path) continue;
      const { data: s } = await admin.storage.from('staff-files').createSignedUrl(a.finished_path, 3600);
      if (s?.signedUrl) links[a.id] = s.signedUrl;
    }
    if (r.file_path) recordUrl = (await admin.storage.from('staff-files').createSignedUrl(r.file_path, 3600)).data?.signedUrl ?? null;
  }
  const waitingDays = Math.floor((Date.now() - new Date(r.stage_started_at).getTime()) / 86400000);

  return (
    <main>
      <p className="small no-print"><Link href="/policies/records">← Policy sign-off records</Link></p>
      <h1>📝 Policy sign-off record</h1>
      <p className="muted">{r.person?.full_name} · {r.person?.homes?.name ?? 'No house'} · {items.length} policies signed · ready {fmtDate(String(r.ready_at).slice(0, 10))}</p>

      {r.status === 'witnessed' && (
        <section className="card">
          <p><strong>✓ Witnessed by {r.witnessed_name}</strong> ({r.witnessed_role}) on {fmtDateTime(r.witnessed_at)}.</p>
          {recordUrl && <p><a className="button" href={recordUrl} target="_blank" rel="noreferrer">🖨 Open the one-page record (print or save)</a></p>}
        </section>
      )}
      {r.status === 'superseded' && <p className="alert">This record was replaced because a policy changed before it was witnessed. A new record is made when the new version is signed.</p>}
      {r.status === 'awaiting_witness' && (
        <p className={`message${waitingDays >= WITNESS_DAYS ? '' : ' ok'}`}>⏳ Waiting for the witness review. With: <strong>{STAGE[r.stage]}</strong> (day {waitingDays + 1} of {WITNESS_DAYS}). If it isn’t signed in {WITNESS_DAYS} days it also goes to the next level.</p>
      )}

      <section>
        <h2>Policies signed</h2>
        <table>
          <thead><tr><th>#</th><th>Code</th><th>Policy</th><th>Version</th><th>Signed</th><th>Signed copy</th></tr></thead>
          <tbody>{items.map((it, i) => (
            <tr key={it.ack_id}>
              <td>{i + 1}</td><td className="small">{it.code ?? '—'}</td><td>{it.title}</td><td>{it.version_label ? `v${it.version_label}` : '—'}</td>
              <td className="small">{fmtDateTime(it.signed_at)}</td>
              <td>{lockedForMe ? <span className="muted small">🔒 On file</span> : links[it.ack_id] ? <a href={links[it.ack_id]} target="_blank" rel="noreferrer">Open</a> : <span className="badge warn">No copy yet</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      {r.status === 'awaiting_witness' && canWitness === true && <WitnessForm id={r.id} count={items.length} staffName={r.person?.full_name ?? 'the staff member'} defaultName={profile.full_name ?? ''} />}
      {r.status === 'awaiting_witness' && canWitness !== true && (
        <p className="card muted">{mine ? 'You have signed everything. Your Program Coordinator or Program Manager will review your signed copies and sign as witness.' : 'Only this person’s Program Coordinator, Program Manager, a director or the Administrator can sign as witness.'}</p>
      )}

      <details className="card no-print">
        <summary><strong>History</strong></summary>
        <ul className="list compact">{(events ?? []).map((e) => <li key={e.id}><span className="small"><strong>{e.event}</strong>{e.detail ? `: ${e.detail}` : ''}</span><span className="muted small">{fmtDateTime(e.at)}</span></li>)}</ul>
      </details>
    </main>
  );
}
