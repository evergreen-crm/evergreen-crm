// Notice board: posts for one house (homeId) or, on the main dashboard, every post the person can see.
// Program Coordinators post to their own house; Program Managers and above post anywhere or to all houses.
import { levelOf, groupOf } from '@/lib/levels';
import { fmtDate, todayISO } from '@/lib/options';
import { createPost, markPostRead, removePost, togglePin } from '@/app/posts/actions';

const PRIORITY = { Urgent: { dot: '🔴', cls: 'bad' }, Important: { dot: '🟡', cls: 'warn' }, Normal: { dot: '📌', cls: '' } };

export default async function NoticeBoard({ supabase, profile, userId, homeId = null, homes = [], back, sp = {} }) {
  const lvl = levelOf(profile);
  const today = todayISO();
  let q = supabase.from('house_posts').select('*, author:created_by(full_name), homes(name)')
    .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30);
  if (homeId) q = q.or(`home_id.eq.${homeId},home_id.is.null`);
  const { data: posts, error } = await q;
  if (error) return <section className="card" id="notices"><h2>📢 Notice board</h2><p className="muted small">Run <code>supabase/house-dashboards.sql</code> in Supabase to switch on the notice board.</p></section>;

  const live = (posts ?? []).filter((p) => !p.expires_on || p.expires_on >= today);
  const ids = live.map((p) => p.id);
  const { data: reads } = ids.length ? await supabase.from('house_post_reads').select('post_id, profile_id, read_at, who:profile_id(full_name)').in('post_id', ids) : { data: [] };
  const readBy = {};
  for (const r of reads ?? []) (readBy[r.post_id] ??= []).push(r);

  const canPost = lvl >= 2 && !groupOf(profile) && (lvl >= 3 || profile.home_id);
  const canManage = (p) => lvl >= 3 || p.created_by === userId;
  const seeReads = lvl >= 2;
  const postHomes = lvl >= 3 ? homes : homes.filter((h) => h.id === profile.home_id);

  return (
    <section className="card" id="notices">
      <h2>📢 Notice board</h2>
      {sp.post_ok && <p className="message ok">{sp.post_ok}</p>}
      {sp.post_error && <p className="message">{sp.post_error}</p>}

      {live.length === 0 && <p className="muted">No notices right now.</p>}
      <ul className="notices">
        {live.map((p) => {
          const pr = PRIORITY[p.priority] ?? PRIORITY.Normal;
          const rs = readBy[p.id] ?? [];
          const iRead = rs.some((r) => r.profile_id === userId);
          return (
            <li key={p.id} className={`notice ${pr.cls} ${p.pinned ? 'pinned' : ''}`}>
              <div className="notice-head">
                <strong>{pr.dot} {p.title}</strong>
                <span className="muted small">{p.pinned && '📍 Pinned · '}{p.home_id ? p.homes?.name ?? 'House' : 'All houses'} · {p.author?.full_name ?? 'Staff'} · {fmtDate(p.created_at.slice(0, 10))}{p.expires_on && ` · until ${fmtDate(p.expires_on)}`}</span>
              </div>
              {p.body && <p className="notice-body">{p.body}</p>}
              <div className="row small no-print" style={{ alignItems: 'center', gap: 8 }}>
                {iRead ? <span className="muted">✓ You read this</span> : (
                  <form action={markPostRead}><input type="hidden" name="post_id" value={p.id} /><input type="hidden" name="back" value={back} /><button className="secondary small">Mark as read</button></form>
                )}
                {seeReads && (
                  <details><summary className="muted">Read by {rs.length}</summary>
                    <span className="small">{rs.map((r) => r.who?.full_name ?? '—').join(', ') || 'Nobody yet'}</span>
                  </details>
                )}
                {canManage(p) && (
                  <>
                    <form action={togglePin}><input type="hidden" name="post_id" value={p.id} /><input type="hidden" name="pinned" value={p.pinned ? '0' : '1'} /><input type="hidden" name="back" value={back} /><button className="link small">{p.pinned ? 'Unpin' : 'Pin'}</button></form>
                    <form action={removePost}><input type="hidden" name="post_id" value={p.id} /><input type="hidden" name="back" value={back} /><button className="link small">Remove</button></form>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canPost && (
        <details className="no-print">
          <summary><strong>+ Post a notice</strong></summary>
          <form action={createPost} className="stack">
            <input type="hidden" name="back" value={back} />
            <label>Title<input name="title" required maxLength={140} placeholder="e.g., New fire exit route — read before your shift" /></label>
            <label>Message<textarea name="body" rows={3} /></label>
            <div className="row">
              <label>For
                <select name="home_id" defaultValue={homeId ?? (lvl >= 3 ? 'all' : profile.home_id)}>
                  {lvl >= 3 && <option value="all">All houses</option>}
                  {postHomes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
              <label>Priority
                <select name="priority" defaultValue="Normal">
                  <option>Normal</option><option>Important</option><option>Urgent</option>
                </select>
              </label>
              <label>Show until (optional)<input type="date" name="expires_on" /></label>
            </div>
            <label className="check"><input type="checkbox" name="pinned" /> Pin to the top</label>
            <p className="muted small">Important and Urgent notices also send a notification to the staff they are for.</p>
            <button>Post</button>
          </form>
        </details>
      )}
    </section>
  );
}
