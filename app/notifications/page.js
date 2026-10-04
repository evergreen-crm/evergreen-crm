// Your notifications: onboarding, policies to sign, training to verify or renew.
import { requireUser } from '@/lib/auth';
import { fmtDateTime } from '@/lib/options';
import { markAllRead, openNotification } from './actions';

export default async function Notifications() {
  const { supabase, user } = await requireUser();
  const { data: list } = await supabase.from('notifications').select('*').eq('profile_id', user.id)
    .order('created_at', { ascending: false }).limit(200);
  const unread = (list ?? []).filter((n) => !n.read_at).length;
  return (
    <main>
      <div className="title-row">
        <h1>Notifications</h1>
        {unread > 0 && <form action={markAllRead}><button className="secondary">Mark all as read</button></form>}
      </div>
      <p className="muted small">Reminders are checked every morning at 8 am: training and certificates 30 days before they expire, overdue onboarding items, and policies not signed after 14 days.</p>
      {list?.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="notif-list">
        {list?.map((n) => (
          <li key={n.id} className={n.read_at ? '' : 'unread'}>
            <form action={openNotification}>
              <input type="hidden" name="id" value={n.id} /><input type="hidden" name="link" value={n.link ?? ''} />
              <button className="notif">
                <strong>{n.title}</strong>
                {n.body && <span>{n.body}</span>}
                <small>{fmtDateTime(n.created_at)}</small>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
