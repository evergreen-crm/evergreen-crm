// 🩺 Duty roles: who gets the tasks for agency-wide roles such as the clinical lead.
// Until someone is chosen, those tasks go to the Administrator. Administrator only.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { personLabel } from '@/lib/levels';
import { setDutyRole } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duty roles · Evergreen' };

const ROLES = [
  { key: 'clinical_lead', label: 'Clinical lead', note: 'Health follow-up: health plan updates after a health change, hospital discharge and medication reconciliation, yearly medication competency checks. A member of the Board of Directors for now.' },
  { key: 'executive_director', label: 'Executive Director tasks', note: 'Agency-wide tasks such as switching off accounts on a last day, financial sign-off and annual reviews.' },
];

export default async function DutyRoles({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireUser(['admin']);
  const [{ data: holders }, { data: people }] = await Promise.all([
    supabase.from('duty_role_holders').select('owner_role, profile_id').is('home_id', null),
    supabase.from('profiles').select('id, full_name, role, level, staff_group').eq('active', true).neq('role', 'family').order('full_name'),
  ]);
  const holder = Object.fromEntries((holders ?? []).map((h) => [h.owner_role, h.profile_id]));
  return (
    <main>
      <p className="small"><Link href="/admin">← Admin</Link></p>
      <h1>🩺 Duty roles</h1>
      <p className="small muted">Choose who gets the automatic tasks for each role. If nobody is chosen, the tasks go to the Administrator. Tasks already made keep their owner; new ones go to the person you choose.</p>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{sp.error}</p>}
      {ROLES.map((r) => (
        <form key={r.key} action={setDutyRole} className="card">
          <h2 style={{ marginTop: 0 }}>{r.label}</h2>
          <p className="small muted">{r.note}</p>
          <input type="hidden" name="owner_role" value={r.key} />
          <label>Person
            <select name="profile_id" defaultValue={holder[r.key] ?? ''}>
              <option value="">Not chosen (the Administrator gets these tasks)</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} · {personLabel(p)}</option>)}
            </select>
          </label>
          <button type="submit">Save</button>
        </form>
      ))}
    </main>
  );
}
