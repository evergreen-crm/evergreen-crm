// Evergreen Academy — a free government course: take it on the provider's site, then upload proof here.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { fmtDate, todayISO } from '@/lib/options';
import { freeCourseByKey } from '@/lib/courses/freeCourses';
import ExternalUpload from '../ExternalUpload';

export default async function ExternalCourse({ params }) {
  const { key } = await params;
  const c = freeCourseByKey(key);
  if (!c) notFound();
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  const today = todayISO();
  const { data: recs } = await supabase.from('trainings').select('id, completed_on, expires_on, verified_by, created_at')
    .eq('profile_id', user.id).eq('title', c.trainingTitle).order('completed_on', { ascending: false }).limit(5);
  const last = recs?.[0];
  const pending = last && !last.verified_by;
  const expired = last?.verified_by && last.expires_on && last.expires_on < today;
  const soon = last?.verified_by && last.expires_on && !expired && (new Date(last.expires_on) - new Date(today)) / 86400000 <= 30;
  const done = last?.verified_by && !expired;
  const renew = c.renewMonths ? `Renew every ${c.renewMonths === 12 ? 'year' : `${c.renewMonths / 12} years`}` : 'No renewal';

  return (
    <main>
      <p className="small no-print"><Link href="/academy">← Evergreen Academy</Link></p>
      <div className="div-banner academy">
        <span className="div-icon">🆓</span>
        <div><h1>{c.title}</h1><p>{c.by} · {c.length} · {renew}</p></div>
      </div>

      {pending && <p className="message">⏳ You sent this on {fmtDate(last.created_at.slice(0, 10))}. It’s waiting for your manager to verify — then the course is complete.</p>}
      {done && <p className={`message ${soon ? '' : 'ok'}`}>{soon ? '⏰' : '✅'} Complete — verified. Completed {fmtDate(last.completed_on)}{last.expires_on ? <> · <strong>renew by {fmtDate(last.expires_on)}</strong></> : ' · no renewal needed'}.{soon ? ' Renewal is due soon — take it again and upload the new certificate.' : ''}</p>}
      {expired && <p className="message">⚠️ Expired on {fmtDate(last.expires_on)}. Take the course again and upload your new certificate.</p>}

      <section className="card">
        <h2>How to complete it</h2>
        <p><strong>Who:</strong> {c.who} · <strong>Supports:</strong> {c.supports}</p>
        <ol>{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <p><a href={c.url} target="_blank" rel="noreferrer" className="button">Open the course ↗</a></p>
        {c.note && <p className="muted small">{c.note}</p>}
        <p className="muted small">This course only counts as complete when your {c.proof === 'reading' ? 'reflection' : c.proof === 'screenshot' ? 'completion screenshot' : 'certificate'} is uploaded here and your manager verifies it.</p>
      </section>

      {!pending && (!done || soon) && (
        <ExternalUpload courseKey={c.key} proof={c.proof} profileId={user.id} today={today} name={profile.full_name ?? 'staff member'} />
      )}
    </main>
  );
}
