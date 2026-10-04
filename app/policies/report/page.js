// Printable sign-off report: every policy, current version, and each person's signature (name, date, time).
// ?person=<id> prints one staff member's sign-off record (personnel file item 14).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { appliesTo } from '@/lib/onboarding';
import { fmtDate, fmtDateTime, TZ } from '@/lib/options';
import ProgramBadge from '@/app/components/ProgramBadge';
import PrintButton from '@/app/PrintButton';

export default async function SignOffReport({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager']);
  const [{ data: policies }, { data: versions }, { data: acks }, { data: people }] = await Promise.all([
    supabase.from('policies').select('*').eq('active', true).eq('require_signature', true).order('category').order('title'),
    supabase.from('policy_versions').select('id, policy_id, version_label, effective_date'),
    supabase.from('policy_acks').select('policy_version_id, profile_id, signed_name, signed_at'),
    supabase.from('profiles').select('id, full_name, role, staff_details(employee_no, program)').in('role', ['admin', 'manager', 'staff']).eq('active', true).order('full_name'),
  ]);
  const sd = (x) => (Array.isArray(x.staff_details) ? x.staff_details[0] : x.staff_details) ?? {};
  const person = sp.person ? people?.find((x) => x.id === sp.person) : null;
  const vById = Object.fromEntries((versions ?? []).map((v) => [v.id, v]));
  const ack = (vid, pid) => acks?.find((a) => a.policy_version_id === vid && a.profile_id === pid);
  const printed = new Date().toLocaleString('en-CA', { timeZone: TZ });

  let total = 0, signed = 0;
  for (const p of policies ?? []) for (const x of people ?? []) {
    if (person && x.id !== person.id) continue;
    if (!appliesTo(p.applies_to, sd(x).program)) continue;
    total++; if (ack(p.current_version_id, x.id)) signed++;
  }

  return (
    <main className="report">
      <p className="small no-print"><Link href="/policies">← Policies</Link></p>
      <div className="report-head">
        <img src="/logo.png" alt="Evergreen Community Care" />
        <div>
          <h1>{person ? `Policy sign-off record — ${person.full_name}` : 'Policy read & sign-off report'}</h1>
          <p className="muted small">
            {person && <>Employee no. {sd(person).employee_no ?? '—'} · <ProgramBadge program={sd(person).program} /> · </>}
            Current versions only · Printed {printed} by {profile.full_name}
          </p>
        </div>
        <span className="no-print"><PrintButton label="Print all" /></span>
      </div>

      <form className="row no-print" action="/policies/report">
        <label>Show
          <select name="person" defaultValue={sp.person ?? ''}>
            <option value="">Every policy — all staff</option>
            {people?.map((x) => <option key={x.id} value={x.id}>{x.full_name} only</option>)}
          </select>
        </label>
        <button className="secondary">Show</button>
      </form>

      <div className="stats">
        <div className={`stat ${signed < total ? 'warn' : ''}`}><strong>{total ? Math.round((100 * signed) / total) : 100}%</strong><span>signed ({signed} of {total})</span></div>
        <div className="stat"><strong>{policies?.length ?? 0}</strong><span>policies needing signature</span></div>
      </div>

      {person ? (
        <table>
          <thead><tr><th>Policy</th><th>Program</th><th>Version</th><th>Signed as</th><th>Date and time</th></tr></thead>
          <tbody>
            {(policies ?? []).filter((p) => appliesTo(p.applies_to, sd(person).program)).map((p) => {
              const v = vById[p.current_version_id]; const a = ack(p.current_version_id, person.id);
              return (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong>{p.code && <div className="muted small">{p.code}</div>}</td>
                  <td><ProgramBadge program={p.applies_to} /></td>
                  <td>v{v?.version_label ?? '—'}</td>
                  <td>{a ? a.signed_name : <span className="badge bad">Not signed</span>}</td>
                  <td>{a ? fmtDateTime(a.signed_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        (policies ?? []).map((p, i) => {
          const v = vById[p.current_version_id];
          const team = (people ?? []).filter((x) => appliesTo(p.applies_to, sd(x).program));
          const n = team.filter((x) => ack(p.current_version_id, x.id)).length;
          return (
            <section key={p.id} className={i > 0 ? 'page-break' : ''}>
              <h2>{p.title} <ProgramBadge program={p.applies_to} /></h2>
              <p className="small muted">{[p.code, p.category, v && `Version ${v.version_label}`, v?.effective_date && `effective ${fmtDate(v.effective_date)}`].filter(Boolean).join(' · ')} · {n} of {team.length} signed</p>
              <table>
                <thead><tr><th>Emp. no.</th><th>Name</th><th>Program</th><th>Signed as</th><th>Date and time</th></tr></thead>
                <tbody>
                  {team.map((x) => {
                    const a = ack(p.current_version_id, x.id);
                    return (
                      <tr key={x.id}>
                        <td className="small">{sd(x).employee_no ?? '—'}</td>
                        <td>{x.full_name}</td>
                        <td><ProgramBadge program={sd(x).program} /></td>
                        <td>{a ? a.signed_name : <span className="badge bad">Not signed</span>}</td>
                        <td>{a ? fmtDateTime(a.signed_at) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })
      )}
      {(policies ?? []).length === 0 && <p className="muted">No policies need signatures yet.</p>}
      <p className="small muted">Signatures are typed full names with the date and time recorded by the system when the person clicked Sign. Records cannot be edited.</p>
    </main>
  );
}
