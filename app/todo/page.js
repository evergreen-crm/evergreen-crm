// ✅ My to-do — everything I need to do, in one list, sorted by urgency. Built automatically from the
// records that already exist; each task opens the page where it is done and disappears once it is finished.
// Program Manager+ and HR also get "My team": who is behind, with a one-tap reminder.
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, groupOf } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { getMyTodos, getTeamTodos, BUCKETS, todoCount } from '@/lib/todos';
import { remindStaff } from './actions';

function Item({ t, today }) {
  return (
    <li className={`todo-item b-${t.bucket}`}>
      <span className="todo-icon">{t.icon}</span>
      <span className="todo-text">
        <strong>{t.title}</strong>
        {t.detail && <span className="small muted">{t.detail}</span>}
      </span>
      <span className="todo-when small">{t.due ? (t.due === today ? 'Today' : fmtDate(t.due)) : ''}</span>
      <Link href={t.href} className="button todo-go">{t.bucket === 'overdue' ? 'Do it now' : 'Open'}</Link>
    </li>
  );
}

export default async function Todo({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const today = todayISO();
  const canTeam = levelOf(profile) >= 3 || groupOf(profile) === 'hr' || profile.role === 'admin';
  const view = canTeam && sp?.view === 'team' ? 'team' : 'me';
  const mine = await getMyTodos(supabase, profile);
  const team = view === 'team' ? await getTeamTodos(supabase, profile) : null;
  const c = todoCount(mine);

  return (
    <main>
      <div className="div-banner">
        <span className="div-icon">✅</span>
        <div><h1>My to-do</h1><p>Everything you need to do, in one place. Tap a task to go straight to it — it disappears by itself when it is done.</p></div>
      </div>
      {sp?.ok && <p className="message ok">{sp.ok}</p>}
      {sp?.error && <p className="message error">{sp.error}</p>}

      {canTeam && (
        <nav className="tabs-bar no-print">
          <Link href="/todo" className={view === 'me' ? 'on' : ''}>Me {c.total > 0 && <span className={`badge ${c.overdue ? 'bad' : 'warn'}`}>{c.total}</span>}</Link>
          <Link href="/todo?view=team" className={view === 'team' ? 'on' : ''}>My team</Link>
        </nav>
      )}

      {view === 'me' && (
        mine.length === 0
          ? <section className="card"><h2>🎉 All done</h2><p className="muted">Nothing is waiting for you right now. New tasks show up here automatically.</p></section>
          : BUCKETS.map((b) => {
            const list = mine.filter((t) => t.bucket === b.key);
            if (!list.length) return null;
            return (
              <section key={b.key} className="card">
                <h2 style={{ marginTop: 0 }}>{b.icon} {b.label} <span className="muted small">({list.length})</span></h2>
                <ul className="todo-list">{list.map((t) => <Item key={t.key} t={t} today={today} />)}</ul>
              </section>
            );
          })
      )}

      {view === 'team' && (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>My team</h2>
          <p className="muted small">Staff with tasks overdue or due soon: offer letters, onboarding, training plan, certificates, badges and unsigned daily notes. A reminder goes to their portal (and email when it is set up) — one per person per day.</p>
          {!team?.length ? <p className="muted">Everyone is up to date. 🎉</p> : (
            <ul className="todo-team">
              {team.map((p) => (
                <li key={p.id}>
                  <details>
                    <summary>
                      <strong>{p.full_name}</strong>
                      <span className="muted small"> · Level {levelOf(p)}</span>
                      {p.overdue > 0 && <span className="badge bad">{p.overdue} overdue</span>}
                      <span className="badge warn">{p.total} to do</span>
                    </summary>
                    <ul className="todo-list">{p.items.map((t) => <Item key={t.key} t={t} today={today} />)}</ul>
                    <form action={remindStaff} className="no-print" style={{ marginTop: 8 }}>
                      <input type="hidden" name="profile_id" value={p.id} />
                      {p.items.slice(0, 6).map((t) => <input key={t.key} type="hidden" name="item" value={t.title} />)}
                      <button className="secondary">🔔 Send {p.full_name.split(' ')[0]} a reminder</button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
