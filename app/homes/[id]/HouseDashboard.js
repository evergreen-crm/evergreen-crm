// One house's dashboard: its KPIs (green / yellow / red), today's shifts and appointments,
// open action items, the latest communication book entries and the house notice board.
import Link from 'next/link';
import { levelOf } from '@/lib/levels';
import { STATUS, loadKpiData } from '@/lib/kpis';
import { HOUSE_TILES, houseKpis, houseValue } from '@/lib/houseKpis';
import { ENTRY_TYPES } from '@/lib/entries';
import { fmtDate, fmtTime, todayISO } from '@/lib/options';
import NoticeBoard from '@/app/components/NoticeBoard';

export default async function HouseDashboard({ supabase, profile, userId, home, homes, sp }) {
  const today = todayISO();
  const lvl = levelOf(profile);
  const [data, { data: shifts }, { data: appts }, { data: items }, { data: commbook }] = await Promise.all([
    loadKpiData(supabase),
    supabase.from('shifts').select('id, start_time, end_time, label, profiles:profile_id(full_name)').eq('home_id', home.id).eq('shift_date', today).order('start_time'),
    supabase.from('appointments').select('id, title, start_time, residents(first_name, last_name)').eq('home_id', home.id).eq('appt_date', today).neq('status', 'Cancelled').order('start_time'),
    supabase.from('action_items').select('id, title, due_date, status, severity, owner:owner_id(full_name)').eq('home_id', home.id).not('status', 'in', '("Closed","Dismissed")').order('due_date').limit(10),
    supabase.from('entries').select('id, entry_date, entry_time, data, author:created_by(full_name)').eq('home_id', home.id).eq('kind', 'commbook').order('created_at', { ascending: false }).limit(3),
  ]);
  const { by, overall } = houseKpis(data, home.id);
  const tiles = HOUSE_TILES.filter((t) => by[t.key]);
  const oc = overall === null ? null : overall >= 98 ? 'green' : overall >= 90 ? 'yellow' : 'red';
  const back = `/homes/${home.id}?tab=dashboard`;

  return (
    <section className="house-dash">
      <div className="exec-head">
        <h2>House dashboard</h2>
        {oc && <span className={`exec-overall kpi-${oc}`}>{STATUS[oc].dot} House compliance {overall}%</span>}
        {lvl >= 2 && <Link href="/kpi" className="small">All KPIs →</Link>}
      </div>
      <div className="exec-tiles">
        {tiles.map((t) => {
          const k = by[t.key];
          return (
            <Link key={t.key} href={k.href ?? '#'} className={`exec-tile kpi-${k.status}`} title={k.detail}>
              <span className="exec-icon">{t.icon}</span>
              <strong>{t.key === 'active_residents' && home.capacity ? `${k.value} / ${home.capacity}` : houseValue(k)}</strong>
              <span>{t.label} {k.status !== 'none' && STATUS[k.status].dot}</span>
              {k.detail && <span className="small muted">{k.detail}</span>}
            </Link>
          );
        })}
      </div>

      <NoticeBoard supabase={supabase} profile={profile} userId={userId} homeId={home.id} homes={homes} back={back} sp={sp} />

      <div className="grid2">
        <div className="card">
          <h3>On shift today</h3>
          {!shifts?.length && <p className="muted small">No shifts scheduled. <Link href="/schedule">Open schedule</Link></p>}
          <ul className="agenda">
            {shifts?.map((s) => <li key={s.id}><span className="when">{fmtTime(s.start_time)}–{fmtTime(s.end_time)}</span><span><strong>{s.profiles?.full_name ?? 'OPEN SHIFT'}</strong>{s.label && <span className="muted small"> · {s.label}</span>}</span></li>)}
          </ul>
        </div>
        <div className="card">
          <h3>Appointments today</h3>
          {!appts?.length && <p className="muted small">None today.</p>}
          <ul className="agenda">
            {appts?.map((a) => <li key={a.id}><span className="when">{a.start_time ? fmtTime(a.start_time) : 'All day'}</span><span><strong>{a.title}</strong>{a.residents && <span className="muted small"> · {a.residents.first_name} {a.residents.last_name}</span>}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>⚠️ Action required for this house</h3>
          {!items?.length && <p className="muted small">Nothing open. 🎉</p>}
          <ul className="action-list">
            {items?.map((i) => {
              const late = i.due_date && i.due_date < today;
              return <li key={i.id}><span>{late || i.severity === 'red' ? '🔴' : '🟡'}</span> <Link href={`/action-items/${i.id}`}>{i.title}</Link> <span className={`small ${late ? 'bad-text' : 'muted'}`}>{i.owner?.full_name ?? 'Unassigned'}{i.due_date ? ` · ${late ? 'overdue since' : 'due'} ${fmtDate(i.due_date)}` : ''}</span></li>;
            })}
          </ul>
        </div>
        <div className="card">
          <h3>📒 Communication book</h3>
          {!commbook?.length && <p className="muted small">No entries yet.</p>}
          <ul className="timeline">
            {commbook?.map((e) => (
              <li key={e.id} className={e.data?.priority === 'Important' ? 'important' : ''}>
                <div className="meta">{fmtDate(e.entry_date)}{e.entry_time && ` · ${fmtTime(e.entry_time)}`} · {e.author?.full_name ?? 'Staff'}</div>
                <p>{ENTRY_TYPES.commbook.summary(e.data ?? {})}</p>
              </li>
            ))}
          </ul>
          <Link href={`/homes/${home.id}?tab=commbook`} className="small">Open communication book →</Link>
        </div>
      </div>
    </section>
  );
}
