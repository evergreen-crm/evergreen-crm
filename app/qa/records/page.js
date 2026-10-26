// 📝 Enter records: every kind of QA record you can type in and save, with counts.
// Plus shortcuts to the other places in the QA portal where you enter things.
import Link from 'next/link';
import { todayISO, fmtDate } from '@/lib/options';
import { QA_RECORD_TYPES, QA_DIVISION } from '@/lib/qa';
import { plainError } from '@/lib/plain';
import { requireQa } from '../guard';
import QaShell from '../QaShell';

export const dynamic = 'force-dynamic';

const OTHER = [
  { href: '/qa/standards', icon: '📚', title: 'COA standards checklist', what: 'Set each standard to Met / Not met, add notes and attach evidence files.' },
  { href: '/qa/audits', icon: '🗂', title: 'Resident file audit', what: 'Pick a resident and answer the 14-item file checklist.' },
  { href: '/qa/actions?new=1', icon: '🛠', title: 'Improvement action', what: 'Something to fix: root cause, the fix, owner and due date.' },
  { href: '/qa/report#signoff', icon: '📄', title: 'Quarterly report sign-off', what: 'Summary, concerns, priorities, ED review and Board date.' },
  { href: '/review', icon: '🗓', title: 'My monthly QA review', what: 'What went well, concerns and actions for last month.' },
];

export default async function QaRecords({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireQa('/qa/records');
  const today = todayISO();
  const { data, error } = await supabase.from('records').select('area, status, due_date, record_date').eq('division', QA_DIVISION).limit(5000);
  const rows = data ?? [];
  const stat = (key) => {
    const r = rows.filter((x) => x.area === key);
    const open = r.filter((x) => x.status === 'Open' || x.status === 'In progress');
    return { total: r.length, open: open.length, overdue: open.filter((x) => x.due_date && x.due_date < today).length, last: r.map((x) => x.record_date).sort().pop() };
  };

  return (
    <QaShell active="/qa/records" title="Quality assurance — enter records" printedBy={profile.full_name}
      intro="Type in and save the quality records COA surveyors ask to see. Pick a record type, fill in the form and press Save. Everything you save is listed below the form, can be edited later, and can open an improvement action.">
      {sp.ok && <p className="message ok no-print">{sp.ok}</p>}
      {(sp.error || error) && <p className="message error no-print">{plainError(sp.error ?? error.message)}</p>}

      <section className="qa-entry-grid">
        {QA_RECORD_TYPES.map((t) => {
          const s = stat(t.key);
          return (
            <div key={t.key} className="card qa-entry-card">
              <h2 style={{ margin: 0 }}>{t.icon} {t.title}</h2>
              <p className="muted small" style={{ margin: '2px 0 6px' }}>COA {t.coa}</p>
              <p className="small" style={{ margin: '0 0 8px' }}>{t.summary}</p>
              <p className="small" style={{ margin: '0 0 10px' }}>
                <strong>{s.total}</strong> saved · {s.open} open{s.overdue ? <span className="bad-text"> · {s.overdue} overdue</span> : ''}{s.last ? <span className="muted"> · last {fmtDate(s.last)}</span> : ''}
              </p>
              <div className="row no-print">
                <Link className="button" href={`/qa/records/${t.key}#new`}>+ Add</Link>
                {s.total > 0 && <Link className="button secondary" href={`/qa/records/${t.key}`}>View all</Link>}
              </div>
            </div>
          );
        })}
      </section>

      <section className="card no-print">
        <h2 style={{ marginTop: 0 }}>Other things you enter in the QA portal</h2>
        <ul className="qa-other-list">
          {OTHER.map((o) => <li key={o.href}><Link href={o.href}><strong>{o.icon} {o.title}</strong></Link> — <span className="small">{o.what}</span></li>)}
        </ul>
      </section>
    </QaShell>
  );
}
