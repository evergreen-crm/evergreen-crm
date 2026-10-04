// Evergreen Academy: mandatory training matrix, renewals and certificates.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { TRAINING_MATRIX, trainingStatus } from '@/lib/onboarding';
import { fmtDate, todayISO } from '@/lib/options';
import { verifyTraining, rejectTraining } from '@/app/academy/actions';
import AddTraining from './AddTraining';
import PrintButton from '@/app/PrintButton';

const ICON = { ok: '✓', soon: '!', expired: '✗', missing: '○', pending: '…' };

export default async function Academy({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isBoss = ['admin', 'manager'].includes(profile.role);
  const today = todayISO();
  const view = isBoss ? (sp.view ?? 'team') : 'me';

  const { data: mine } = await supabase.from('trainings').select('*').eq('profile_id', user.id).order('completed_on', { ascending: false });
  const myRows = TRAINING_MATRIX.map((t) => ({ t, s: trainingStatus(mine ?? [], t.title, today) }));
  const myDue = myRows.filter((r) => ['missing', 'expired', 'soon'].includes(r.s.key) && !r.t.ifApplicable).length;

  let team = [], all = [], pending = [];
  if (isBoss && view === 'team') {
    const [{ data: people }, { data: trs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, staff_details(employee_no, employment_status)')
        .in('role', ['staff', 'manager']).eq('active', true).order('full_name'),
      supabase.from('trainings').select('id, profile_id, title, completed_on, expires_on, verified_by, provider, file_path, person:profile_id(full_name)'),
    ]);
    team = people ?? []; all = trs ?? [];
    pending = all.filter((t) => !t.verified_by);
  }
  let fileUrls = {};
  const files = pending.map((p) => p.file_path).filter(Boolean);
  if (files.length) {
    const { data } = await supabase.storage.from('staff-files').createSignedUrls(files, 3600);
    fileUrls = Object.fromEntries((data ?? []).map((s) => [s.path, s.signedUrl]));
  }

  return (
    <main>
      <div className="div-banner academy">
        <span className="div-icon">🎓</span>
        <div><h1>Evergreen Academy</h1><p>Mandatory training (MCFD Standard G.3), renewals and certificates</p></div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>
      {isBoss && (
        <nav className="tabs-bar no-print">
          <Link href="/academy?view=team" className={view === 'team' ? 'on' : ''}>Team compliance</Link>
          <Link href="/academy?view=me" className={view === 'me' ? 'on' : ''}>My training</Link>
        </nav>
      )}

      {view === 'me' && (
        <>
          <div className="stats">
            <div className={`stat ${myDue ? 'bad' : ''}`}><strong>{myDue}</strong><span>to do or renew</span></div>
            <div className="stat"><strong>{(mine ?? []).filter((m) => m.verified_by).length}</strong><span>certificates</span></div>
          </div>
          <table>
            <thead><tr><th>Training</th><th>When it’s due</th><th>Last completed</th><th>Status</th><th>Certificate</th></tr></thead>
            <tbody>
              {myRows.map(({ t, s }) => (
                <tr key={t.key} className={s.key === 'expired' || (s.key === 'missing' && !t.ifApplicable) ? 'late' : ''}>
                  <td><strong>{t.title}</strong><div className="muted small">{t.hours} h module{t.ifApplicable ? ' · if it applies to your role' : ''}</div></td>
                  <td className="small">{t.when}<div className="muted">Renew: {t.renewMonths ? (t.renewMonths === 12 ? 'every year' : `every ${t.renewMonths / 12} years`) : 'per certificate'}</div></td>
                  <td>{s.last ? fmtDate(s.last.completed_on) : '—'}</td>
                  <td><span className={`badge ${s.key === 'ok' ? '' : s.key === 'pending' || s.key === 'soon' ? 'warn' : 'bad'}`}>{ICON[s.key]} {s.label}</span></td>
                  <td>{s.last?.verified_by ? <Link href={`/hr/certificate/${s.last.id}`}>🏅 View</Link> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <AddTraining profileId={user.id} trainings={TRAINING_MATRIX} today={today} />
          {(mine ?? []).filter((m) => !TRAINING_MATRIX.some((t) => t.title.toLowerCase() === m.title.toLowerCase())).length > 0 && (
            <>
              <h2>Other training</h2>
              <ul className="list">
                {mine.filter((m) => !TRAINING_MATRIX.some((t) => t.title.toLowerCase() === m.title.toLowerCase())).map((m) => (
                  <li key={m.id}><span style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.title} · {fmtDate(m.completed_on)}{m.expires_on && ` · renew by ${fmtDate(m.expires_on)}`}</span>
                    {m.verified_by ? <Link href={`/hr/certificate/${m.id}`}>🏅 Certificate</Link> : <span className="badge warn">Waiting for verification</span>}
                  </span></li>
                ))}
              </ul>
            </>
          )}
          <p className="small"><Link href={`/hr/${user.id}/certificates`}>🏅 Print all my certificates</Link></p>
        </>
      )}

      {view === 'team' && (
        <>
          {pending.length > 0 && (
            <section className="card">
              <h2>Waiting for verification ({pending.length})</h2>
              <table>
                <thead><tr><th>Staff</th><th>Training</th><th>Completed</th><th>Proof</th><th></th></tr></thead>
                <tbody>
                  {pending.map((t) => (
                    <tr key={t.id}>
                      <td>{t.person?.full_name}</td>
                      <td>{t.title}{t.provider && <div className="muted small">{t.provider}</div>}</td>
                      <td>{fmtDate(t.completed_on)}{t.expires_on && <div className="muted small">expires {fmtDate(t.expires_on)}</div>}</td>
                      <td>{t.file_path && fileUrls[t.file_path] ? <a href={fileUrls[t.file_path]} target="_blank" rel="noreferrer">📎 View</a> : '—'}</td>
                      <td className="row">
                        <form action={verifyTraining}><input type="hidden" name="id" value={t.id} /><button>✓ Verify</button></form>
                        <form action={rejectTraining}><input type="hidden" name="id" value={t.id} /><button className="secondary">Remove</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <h2>Team compliance</h2>
          <p className="muted small">✓ valid · ! renew within 30 days · ✗ expired · ○ not done · … waiting for verification. Click a name for their HR file.</p>
          <div className="matrix-wrap">
            <table className="matrix">
              <thead>
                <tr><th>Staff</th>{TRAINING_MATRIX.map((t) => <th key={t.key} title={t.title}><span>{t.title}</span></th>)}</tr>
              </thead>
              <tbody>
                {team.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/hr/${p.id}`}>{p.full_name}</Link><div className="muted small">{p.staff_details?.employee_no ?? p.staff_details?.[0]?.employee_no}</div></td>
                    {TRAINING_MATRIX.map((t) => {
                      const s = trainingStatus(all.filter((x) => x.profile_id === p.id), t.title, today);
                      return <td key={t.key} className={`m-${s.key}`} title={`${t.title}: ${s.label}`}>{ICON[s.key]}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {team.length === 0 && <p className="muted">No active staff yet.</p>}
        </>
      )}
    </main>
  );
}
