// Portal home card: the signed-in person's latest performance badge and 24-month bonus count.
import Link from 'next/link';
import BadgePill from './BadgePill';
import { BADGE, bonusCount, fmtMonth, reasonByKey } from '@/lib/badges';

export default async function MyBadge({ supabase, userId }) {
  const { data: badges, error } = await supabase.from('staff_badges')
    .select('id, month, color, reasons, restart, acknowledged_at').eq('profile_id', userId).order('month', { ascending: false }).limit(36);
  if (error) return null; // table not created yet
  const latest = badges?.[0];
  const count = bonusCount(badges ?? []);
  const b = latest ? BADGE[latest.color] : null;
  return (
    <section className="card no-print" style={{ borderLeft: `6px solid ${b?.border ?? '#c9d4ce'}`, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 150 }}>
        <div className="muted small">My performance badge</div>
        <BadgePill color={latest?.color} big />
        {latest && <div className="muted small" style={{ marginTop: 4 }}>{fmtMonth(latest.month)}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        {latest ? <p style={{ margin: 0 }}><strong>{b.meaning}.</strong>{latest.reasons?.length ? ' ' + latest.reasons.map((k) => reasonByKey(k)?.label).filter(Boolean).join(' · ') : ''}</p>
          : <p style={{ margin: 0 }} className="muted">Your Program Manager sets your badge each month. Green every month, with zero substantiated complaints, earns the 24-month Excellence Bonus.</p>}
        <div style={{ marginTop: 8 }}>
          <div className="small"><strong>Excellence Bonus: month {count.months} of 24</strong> · Yellow months used {count.yellows} of 3{count.eligible ? ' · 🎉 Eligible for bonus review' : ''}</div>
          <div style={{ height: 8, background: '#dfe7e2', borderRadius: 4, overflow: 'hidden', marginTop: 4, maxWidth: 420 }}>
            <span style={{ display: 'block', height: '100%', width: `${(count.months / 24) * 100}%`, background: '#3c8a64' }} />
          </div>
        </div>
      </div>
      <Link href="/badges" className="button secondary">{latest && !latest.acknowledged_at ? 'See and acknowledge →' : 'My badge history →'}</Link>
    </section>
  );
}
