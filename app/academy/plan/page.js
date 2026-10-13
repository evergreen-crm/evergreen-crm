// Evergreen Academy — the 90-day orientation and training plan, dated from each person's hire date.
// Items tick off automatically from the training record. Managers and HR can open anyone's plan.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { canHR, levelOf } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { trainingStatus, appliesTo } from '@/lib/onboarding';
import { PLAN_PHASES, PLAN_ITEMS } from '@/lib/courses/trainingPlan';
import ProgramBadge from '@/app/components/ProgramBadge';
import PrintButton from '@/app/PrintButton';

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const KIND = { academy: '🎬 Evergreen Academy', free: '🆓 Free online course', inperson: '🧑‍🏫 Course / in person', onboarding: '📝 Onboarding', signoff: '✍️ Manager sign-off' };
const mins = (m) => (m >= 60 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);

export default async function TrainingPlan({ searchParams }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const isBoss = canHR(profile);
  const personId = isBoss && sp?.person ? sp.person : user.id;
  const today = todayISO();

  const [{ data: person }, { data: sd }, { data: recs }, { data: people }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, level, role').eq('id', personId).maybeSingle(),
    supabase.from('staff_details').select('hire_date, program').eq('profile_id', personId).maybeSingle(),
    supabase.from('trainings').select('id, title, completed_on, expires_on, verified_by').eq('profile_id', personId),
    isBoss ? supabase.from('profiles').select('id, full_name').in('role', ['staff', 'manager']).eq('active', true).order('full_name') : Promise.resolve({ data: [] }),
  ]);
  const program = sd?.program ?? 'Both';
  const hire = sd?.hire_date ?? null;
  const leader = levelOf(person) >= 2;
  const items = PLAN_ITEMS.filter((it) => appliesTo(it.program, program) && (!it.leaders || leader)).map((it) => {
    const tracked = ['academy', 'free', 'inperson'].includes(it.kind);
    const s = tracked ? trainingStatus(recs ?? [], it.title, today) : null;
    const due = hire ? addDays(hire, it.day) : null;
    const done = s && ['ok', 'soon'].includes(s.key);
    const late = !done && tracked && due && due < today && !it.ifApplicable;
    return { ...it, s, due, done, late };
  });
  const required = items.filter((i) => ['academy', 'free', 'inperson'].includes(i.kind) && !i.ifApplicable);
  const doneCount = required.filter((i) => i.done).length;
  const pct = required.length ? Math.round((doneCount / required.length) * 100) : 0;
  const onlineMin = items.filter((i) => ['academy', 'free'].includes(i.kind)).reduce((t, i) => t + i.minutes, 0);
  const dayNo = hire ? Math.floor((new Date(today) - new Date(hire)) / 86400000) + 1 : null;

  return (
    <main>
      <p className="small no-print"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">📅</span>
        <div><h1>90-day training plan</h1><p>{person?.full_name ?? 'Staff member'} · <ProgramBadge program={program} /> · {hire ? <>Hired {fmtDate(hire)}{dayNo > 0 && dayNo <= 90 ? ` · today is day ${dayNo}` : ''}</> : 'No hire date yet — dates show as days after hire'}</p></div>
        <span className="no-print"><PrintButton label="Print plan" /></span>
      </div>

      {isBoss && (
        <form className="row no-print" style={{ alignItems: 'flex-end', gap: 8 }}>
          <label>Show the plan for<select name="person" defaultValue={personId}>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
          <button className="secondary">Open</button>
        </form>
      )}

      <section className="card">
        <div className="stats">
          <div className="stat"><strong>{pct}%</strong><span>{doneCount} of {required.length} required done</span></div>
          <div className={`stat ${items.some((i) => i.late) ? 'bad' : ''}`}><strong>{items.filter((i) => i.late).length}</strong><span>overdue</span></div>
          <div className="stat"><strong>{mins(onlineMin)}</strong><span>online learning in total</span></div>
          <div className="stat"><strong>90</strong><span>days to finish</span></div>
        </div>
        <div style={{ height: 8, background: '#dfe7e2', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#3c8a64' }} /></div>
        <p className="muted small" style={{ marginTop: 8 }}>How it works: about 15 minutes of online learning per shift, on paid time. Every course ends with a quiz or an uploaded certificate, and your manager verifies it. The plan ticks itself off as you go.</p>
      </section>

      {PLAN_PHASES.map((ph) => {
        const list = items.filter((i) => i.phase === ph.key);
        if (!list.length) return null;
        return (
          <section key={ph.key} className="card">
            <h2 style={{ marginBottom: 2 }}>{ph.label}</h2>
            <p className="muted small" style={{ marginTop: 0 }}>{ph.range}{hire ? ` · due ${fmtDate(addDays(hire, list[0].day))}` : ''} · {ph.hint}</p>
            <table>
              <thead><tr><th>Training</th><th>Type</th><th>Time</th><th>Status</th><th className="no-print"></th></tr></thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.title} className={i.late ? 'late' : ''}>
                    <td><strong>{i.label ?? i.title}</strong>{i.ifApplicable && <div className="muted small">If it applies: {i.ifApplicable}</div>}{i.who && <div className="muted small">{i.who}</div>}</td>
                    <td className="small">{KIND[i.kind]}</td>
                    <td className="small">{i.minutes ? mins(i.minutes) : '—'}</td>
                    <td>{i.s ? <span className={`badge ${i.done ? '' : i.s.key === 'pending' ? 'warn' : i.late ? 'bad' : 'warn'}`}>{i.done ? '✓ Done' : i.s.key === 'pending' ? '… Waiting for verification' : i.late ? `✗ Overdue (${fmtDate(i.due)})` : i.due ? `Due ${fmtDate(i.due)}` : 'To do'}</span>
                      : <span className="muted small">{i.kind === 'signoff' ? 'Manager' : 'See checklist'}</span>}</td>
                    <td className="no-print">{i.href ? <Link href={i.href}>{i.done ? 'Review' : 'Start →'}</Link> : i.kind === 'inperson' && !i.done ? <Link href="/academy?view=me#add">Add certificate</Link> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="muted small">Based on the Evergreen training matrix (MCFD Standard G.3, CLBC requirements). In-person courses (First Aid, NVCI, ASIST, San’yas) are booked by your manager.</p>
    </main>
  );
}
