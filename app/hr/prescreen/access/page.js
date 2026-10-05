// Prescreening access — only the administrator decides who can open screening files.
import Link from 'next/link';
import { requirePrescreen } from '@/lib/prescreenAuth';
import { grantAccess, revokeAccess } from '../actions';

export const metadata = { title: 'Prescreening access · Evergreen' };
const LABEL = { hr: 'HR staff — full screening access and clearance decisions', interviewer: 'Interviewer — interviews and reference checks only' };

export default async function PrescreenAccess({ searchParams }) {
  const sp = await searchParams;
  const { supabase } = await requirePrescreen(['admin']);
  const [{ data: access }, { data: people }] = await Promise.all([
    supabase.from('prescreen_access').select('profile_id, access, granted_at'),
    supabase.from('profiles').select('id, full_name, role, active').in('role', ['manager', 'staff']).eq('active', true).order('full_name'),
  ]);
  const byId = Object.fromEntries((people ?? []).map((p) => [p.id, p]));
  const has = new Set((access ?? []).map((a) => a.profile_id));

  return (
    <main>
      <p className="small"><Link href="/hr/prescreen">← Prescreening</Link></p>
      <h1>Who can open prescreens</h1>
      <p className="muted">Only you, the administrator, can give or remove access. Screening files hold personal information, references and criminal record results, so keep this list short. Executive approval can only be signed by an administrator.</p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <form action={grantAccess} className="card">
        <h2>Give access</h2>
        <div className="row">
          <label>Person
            <select name="profile_id" required defaultValue=""><option value="" disabled>Choose…</option>
              {(people ?? []).filter((p) => !has.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
            </select>
          </label>
          <label>Role
            <select name="access" defaultValue="hr"><option value="hr">{LABEL.hr}</option><option value="interviewer">{LABEL.interviewer}</option></select>
          </label>
        </div>
        <button>Give access</button>
        <p className="muted small">People must already have a CRM login. Add new people in <Link href="/admin">Admin</Link> first.</p>
      </form>

      <h2>Current access</h2>
      <ul className="list ps-access">
        <li><span><strong>Administrators</strong> <span className="muted small">· always have full access</span></span></li>
        {(access ?? []).map((a) => (
          <li key={a.profile_id}>
            <span><strong>{byId[a.profile_id]?.full_name ?? 'Former user'}</strong> <span className="muted small">· {LABEL[a.access]}</span></span>
            <form action={revokeAccess}><input type="hidden" name="profile_id" value={a.profile_id} /><button className="link small">Remove</button></form>
          </li>
        ))}
      </ul>
      {(access ?? []).length === 0 && <p className="muted">Nobody else has access yet.</p>}
    </main>
  );
}
