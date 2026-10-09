// One probation review: the form for the Program Coordinator / Program Manager, and acknowledgement by the staff member.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf, canHR } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { saveReview, acknowledgeReview } from '../actions';

const RATINGS = ['Meets expectations', 'Needs improvement', 'Does not meet'];
const DECISIONS = [
  { v: 'Confirm full-time', hint: 'Passed probation — becomes full-time (HR file updated).' },
  { v: 'Extend probation', hint: 'Another review is booked in 30 days.' },
  { v: 'End employment', hint: 'Follow the HR policy and speak with HR before telling the staff member.' },
];

export default async function Review({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const lvl = levelOf(profile);
  const { data: r } = await supabase.from('probation_reviews').select('*').eq('id', id).maybeSingle();
  if (!r) notFound();
  const [{ data: prob }, { data: person }, { data: history }, { data: reviewer }] = await Promise.all([
    supabase.from('staff_probation').select('*').eq('staff_id', r.staff_id).maybeSingle(),
    supabase.from('profiles').select('full_name, home_id, homes(name)').eq('id', r.staff_id).maybeSingle(),
    supabase.from('probation_reviews').select('*').eq('staff_id', r.staff_id).order('review_day'),
    r.reviewer_id ? supabase.from('profiles').select('full_name').eq('id', r.reviewer_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const finalDay = Math.max(...(history ?? [r]).map((x) => x.review_day));
  const isFinal = r.review_day >= 120 && r.review_day === finalDay;
  const mine = r.staff_id === user.id;
  const canEdit = !mine && !r.completed_on && (lvl >= 2 || canHR(profile)) && (!isFinal || lvl >= 3);
  const today = todayISO();

  return (
    <main>
      <p className="small no-print"><Link href="/probation">← Probation reviews</Link></p>
      <h1>{r.review_day}-day review · {person?.full_name ?? 'Staff member'}</h1>
      <p className="muted">{prob?.position ?? 'Position not set'} · {person?.homes?.name ?? 'No house'} · Hired {fmtDate(prob?.hire_date)} · Probation: <strong>{prob?.status}</strong></p>
      {sp.ok && <p className="message ok">{sp.ok}</p>}
      {sp.error && <p className="message">{sp.error}</p>}

      <ol className="chain">
        {(history ?? []).map((h) => (
          <li key={h.id} className={h.completed_on ? 'done' : ''}>
            <Link href={`/probation/${h.id}`} style={{ color: 'inherit' }}>{h.review_day}-day</Link>
          </li>
        ))}
        <li className={prob?.status === 'Confirmed full-time' ? 'done' : ''}>Full-time</li>
      </ol>

      <section className="card">
        <dl className="facts">
          <dt>Due</dt><dd>{fmtDate(r.due_date)}{!r.completed_on && r.due_date < today && <span className="badge bad"> Overdue</span>}</dd>
          <dt>Completed by</dt><dd>{isFinal ? 'Program Manager or above (final review)' : 'Program Coordinator'}</dd>
          {r.completed_on && <><dt>Completed</dt><dd>{fmtDate(r.completed_on)}{reviewer?.full_name ? ` by ${reviewer.full_name}` : ''}</dd></>}
          {r.completed_on && <><dt>Staff acknowledged</dt><dd>{r.staff_acknowledged ? '✅ Yes' : 'Not yet'}</dd></>}
        </dl>
      </section>

      {canEdit ? (
        <form action={saveReview} className="card">
          <input type="hidden" name="id" value={r.id} />
          <h2>Review</h2>
          <label>Overall rating<select name="rating" defaultValue={r.rating ?? ''}>
            <option value="">Choose…</option>{RATINGS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label>Strengths — what is going well<textarea name="strengths" rows={3} defaultValue={r.strengths ?? ''} placeholder="Start with what went well: relationships with youth, documentation, teamwork…" /></label>
          <label>Areas to improve<textarea name="areas_to_improve" rows={3} defaultValue={r.areas_to_improve ?? ''} /></label>
          <label>Goals until the next review<textarea name="goals_next_period" rows={3} defaultValue={r.goals_next_period ?? ''} placeholder="Specific and measurable, e.g. 'All shift notes signed before end of shift'" /></label>
          {isFinal && (
            <fieldset className="card" style={{ background: '#f4f7f5' }}>
              <legend><strong>Final decision</strong></legend>
              {DECISIONS.map((d) => (
                <label key={d.v} className="check"><input type="radio" name="final_decision" value={d.v} defaultChecked={r.final_decision === d.v} /> <span><strong>{d.v}</strong> — <span className="muted small">{d.hint}</span></span></label>
              ))}
            </fieldset>
          )}
          <div className="row" style={{ alignItems: 'end' }}>
            <label>Date of review<input type="date" name="completed_on" defaultValue={today} /></label>
            <button name="complete" value="0" className="secondary">Save draft</button>
            <button name="complete" value="1">{isFinal ? 'Complete review & record decision' : 'Complete review'}</button>
          </div>
        </form>
      ) : (
        <section className="card">
          <h2>Review</h2>
          <dl className="facts">
            <dt>Rating</dt><dd>{r.rating ?? '—'}</dd>
            <dt>Strengths</dt><dd>{r.strengths ?? '—'}</dd>
            <dt>Areas to improve</dt><dd>{r.areas_to_improve ?? '—'}</dd>
            <dt>Goals</dt><dd>{r.goals_next_period ?? '—'}</dd>
            {r.final_decision && <><dt>Decision</dt><dd><strong>{r.final_decision}</strong></dd></>}
          </dl>
          {!r.completed_on && <p className="muted small">{isFinal ? 'The final review is completed by a Program Manager or above.' : 'Not completed yet.'}</p>}
          {mine && r.completed_on && !r.staff_acknowledged && (
            <form action={acknowledgeReview} className="no-print" style={{ marginTop: 12 }}>
              <input type="hidden" name="id" value={r.id} />
              <button>I have read and discussed this review</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
