// My orientation: the 6 days, step by step. Online steps open the Evergreen Academy course and tick themselves when the
// quiz is passed. Other steps are signed off by the Program Coordinator. One certificate when everything is done.
// Leaders open a team member's orientation with ?p=<id> (from /orientation/team).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { fmtDate } from '@/lib/options';
import { plainError } from '@/lib/plain';
import PaperworkList from '@/app/components/PaperworkList';
import { tickStep } from './actions';

const KIND = { training: 'Course', quiz: 'Course', practical: 'In person', shift: 'Shift', admin: 'With your PC', lunch: 'Lunch', external: 'Outside course' };
const EXTERNAL = { 'Naloxone 101 (online, free)': 'naloxone', 'Indigenous cultural safety': 'csps_indigenous' };
const courseHref = (k) => (k === 'orientation' ? '/academy/orientation' : `/academy/course/${k}`);

export default async function Orientation({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, user } = await requireUser(['admin', 'manager', 'staff']);
  const p = sp.p || user.id;
  const self = p === user.id;
  const [{ data: steps, error }, { data: status }, { data: canTick }, { data: person }] = await Promise.all([
    supabase.rpc('orientation_plan_for', { p }),
    supabase.rpc('orientation_status', { p }),
    self ? Promise.resolve({ data: false }) : supabase.rpc('orientation_can_tick', { p }),
    supabase.from('profiles').select('full_name').eq('id', p).maybeSingle(),
  ]);
  if (error) return <main><h1>Orientation</h1><p className="alert">{plainError(error.message)}</p></main>;
  const list = steps ?? [];
  const days = [...new Set(list.map((s) => s.day_number))].sort((a, b) => a - b);
  const real = list.filter((s) => s.kind !== 'lunch');
  const done = real.filter((s) => s.done).length;
  const current = list.find((s) => !s.done)?.day_number ?? null;
  const name = self ? 'My orientation' : `Orientation: ${person?.full_name ?? 'staff member'}`;

  return (
    <main>
      {!self && <p className="small no-print"><Link href="/orientation/team">← Team orientation</Link></p>}
      <div className="div-banner academy">
        <span className="div-icon">🧭</span>
        <div><h1>{name}</h1><p>6 days · Days 1–4 online in the Evergreen Academy · Days 5–6 in person · {done} of {real.length} steps done</p></div>
      </div>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="alert">{plainError(sp.error)}</p>}
      <div style={{ height: 10, background: 'var(--line, #e3e3e3)', borderRadius: 6, overflow: 'hidden', margin: '8px 0 16px' }} aria-label={`${done} of ${real.length} steps done`}>
        <div style={{ width: `${real.length ? Math.round((done / real.length) * 100) : 0}%`, height: '100%', background: '#1f5e45' }} />
      </div>

      {status?.complete ? (
        <section className="card">
          <h2>🎓 Orientation complete</h2>
          <p>Certificate <strong>{status.certificate_no}</strong> · completed {fmtDate(String(status.completed_at).slice(0, 10))}. It is in {self ? 'your' : 'the'} training record and staff file.</p>
          <PaperworkList supabase={supabase} profileId={p} title="Certificate and course records (PDF)" />
        </section>
      ) : self ? (
        <p className="small">Work through the steps in order. Online courses tick themselves when you pass the quiz (80%). Your Program Coordinator signs off the other steps. Each day opens when the days before it are done. When everything is done you get one certificate for the whole orientation.</p>
      ) : canTick ? (
        <p className="small">Sign off each in-person or outside step when it is done. Academy courses tick themselves when the quiz is passed. The final sign-off issues the orientation certificate.</p>
      ) : <p className="small muted">You can see this orientation but not sign it off.</p>}

      {days.map((d) => {
        const items = list.filter((s) => s.day_number === d);
        const locked = items[0]?.locked;
        const dn = items.filter((s) => s.kind !== 'lunch' && s.done).length;
        const dt = items.filter((s) => s.kind !== 'lunch').length;
        return (
          <details key={d} className="card" open={d === current || (!current && d === 1)} style={{ padding: 12 }}>
            <summary><strong>Day {d}</strong> · {d <= 4 ? 'Online' : 'In person'} · {dn}/{dt} done {locked ? <span className="badge warn">🔒 Opens when earlier days are done</span> : dn === dt ? <span className="badge">✓ Done</span> : null}</summary>
            <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {items.map((s) => {
                const ext = s.kind === 'external' ? EXTERNAL[s.title] : null;
                const tickable = !s.course_ready && s.kind !== 'lunch';
                return (
                  <li key={s.id} id={`i-${s.id}`} className="small" style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 8, padding: '8px 0', borderTop: '1px solid var(--line, #ddd)', alignItems: 'center', opacity: s.kind === 'lunch' ? 0.6 : 1 }}>
                    <span className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.start_time}–{s.end_time}</span>
                    <span>
                      <span className="badge" style={{ marginRight: 6 }}>{KIND[s.kind] ?? s.kind}</span>
                      <strong>{s.done && s.kind !== 'lunch' ? '✓ ' : ''}{s.title}</strong>
                      {s.notes && <div className="muted">{s.course_key && !s.course_ready ? 'Course coming soon: your Program Coordinator signs this off' : s.notes}</div>}
                      {s.done && s.kind !== 'lunch' && <div className="muted">{s.done_how}{s.score ? ` · ${s.score}` : ''}{s.done_at ? ` · ${fmtDate(String(s.done_at).slice(0, 10))}` : ''}</div>}
                    </span>
                    <span>
                      {self && !s.done && !s.locked && s.course_ready && <Link className="button" href={courseHref(s.course_key)}>Start</Link>}
                      {self && !s.done && !s.locked && ext && <Link className="button secondary" href={`/academy/external/${ext}`}>Open</Link>}
                      {self && s.done && s.course_ready && <Link className="small" href={courseHref(s.course_key)}>Review</Link>}
                      {canTick && !status?.complete && tickable && !s.locked && (
                        <form action={tickStep}>
                          <input type="hidden" name="p" value={p} /><input type="hidden" name="item" value={s.id} />
                          <input type="hidden" name="done" value={s.done ? '0' : '1'} />
                          <button type="submit" className={s.done ? 'secondary' : ''}>{s.done ? 'Undo' : 'Sign off'}</button>
                        </form>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          </details>
        );
      })}
    </main>
  );
}
