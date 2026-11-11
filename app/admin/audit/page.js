// 🛡️ Security audit log (Administrator and CEO, read only): every record that was added, changed or removed,
// who did it and when, plus the history of security-setting changes. Nothing here can be edited or deleted.
// supabase/ceo-audit-prescreen.sql
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { levelOf } from '@/lib/levels';
import { SECTIONS, ROLES, LEVELS } from '@/lib/sections';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Security audit log · Evergreen' };

// With the year: an audit log is read long after the fact. B.C. time (UTC-7, like the rest of the CRM).
const fmtDateTime = (ts) => (ts ? new Date(new Date(ts).getTime() - 7 * 3600e3).toLocaleString('en-CA', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const PER_PAGE = 50;
const ACTIONS = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' };
const nice = (t) => String(t ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
const short = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
};
// A readable name for the record, when it has one.
const nameOf = (d) => !d ? null
  : d.full_name ?? d.title ?? d.name ?? ([d.first_name, d.last_name].filter(Boolean).join(' ') || null) ?? null;
const HIDE = new Set(['updated_at', 'created_at']);
// For a change: only the fields whose value is different.
function changes(oldD, newD) {
  const out = [];
  for (const k of new Set([...Object.keys(oldD ?? {}), ...Object.keys(newD ?? {})])) {
    if (HIDE.has(k)) continue;
    if (JSON.stringify(oldD?.[k] ?? null) !== JSON.stringify(newD?.[k] ?? null)) out.push([k, oldD?.[k], newD?.[k]]);
  }
  return out;
}

export default async function AuditLog({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (!(profile.role === 'admin' || levelOf(profile) >= 7)) redirect('/more?error=' + encodeURIComponent('The security audit log is for the administrator and the CEO only.'));

  const table = /^[a-z_]{1,60}$/.test(sp.table ?? '') ? sp.table : '';
  const action = ACTIONS[sp.action] ? sp.action : '';
  const who = /^[0-9a-f-]{36}$/.test(sp.who ?? '') ? sp.who : '';
  const from = isDate(sp.from) ? sp.from : '';
  const to = isDate(sp.to) ? sp.to : '';
  const page = Math.max(1, parseInt(sp.page, 10) || 1);

  // Dates are B.C. days (UTC-7, like the rest of the CRM).
  let q = supabase.from('audit_log').select('id, table_name, record_id, action, old_data, new_data, changed_by, changed_at', { count: 'exact' });
  if (table) q = q.eq('table_name', table);
  if (action) q = q.eq('action', action);
  if (who) q = q.eq('changed_by', who);
  if (from) q = q.gte('changed_at', `${from}T00:00:00-07:00`);
  if (to) q = q.lte('changed_at', `${to}T23:59:59-07:00`);
  const [{ data: rows, count, error }, { data: tables }, { data: people }, { data: slog }] = await Promise.all([
    q.order('changed_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1),
    supabase.rpc('audit_log_tables'),
    supabase.from('profiles').select('id, full_name').order('full_name'),
    supabase.from('section_access_log').select('id, section, role, old_level, new_level, changed_at, changed_by').order('changed_at', { ascending: false }).limit(40),
  ]);
  const notReady = error && /permission|does not exist|schema/i.test(error.message);
  const nameBy = Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]));
  const whoName = (id) => (id ? nameBy[id] ?? 'Someone no longer listed' : 'System (automatic)');
  const secName = Object.fromEntries(SECTIONS.map((s) => [s.key, `${s.icon} ${s.label}`]));
  const roleName = Object.fromEntries(ROLES);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const link = (p) => '/admin/audit?' + new URLSearchParams({ ...(table && { table }), ...(action && { action }), ...(who && { who }), ...(from && { from }), ...(to && { to }), page: String(p) });
  const filtered = table || action || who || from || to;

  return (
    <main>
      <p className="small no-print"><Link href="/more">← More</Link></p>
      <h1>🛡️ Security audit log</h1>
      <p className="small">Every record that was added, changed or removed in the CRM, who did it and when. This page is read only: entries can’t be edited or deleted by anyone. Only the Administrator and the CEO can open it.</p>
      {notReady && <p className="message">The audit log isn’t open for this account yet (setup file: ceo-audit-prescreen.sql).</p>}

      <form method="get" action="/admin/audit" className="card no-print">
        <div className="row">
          <label>Area
            <select name="table" defaultValue={table}>
              <option value="">All areas</option>
              {(tables ?? []).map((t) => <option key={t} value={t}>{nice(t)}</option>)}
            </select>
          </label>
          <label>What happened
            <select name="action" defaultValue={action}>
              <option value="">Anything</option>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Who
            <select name="who" defaultValue={who}>
              <option value="">Anyone</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>From<input type="date" name="from" defaultValue={from} /></label>
          <label>To<input type="date" name="to" defaultValue={to} /></label>
        </div>
        <p><button type="submit">Show</button> {filtered && <Link href="/admin/audit">Clear</Link>}</p>
      </form>

      <p className="small muted">{(count ?? 0).toLocaleString('en-CA')} {count === 1 ? 'entry' : 'entries'}{filtered ? ' match' : ''} · page {page} of {pages}</p>
      {!(rows ?? []).length && !notReady && <p className="muted">No entries{filtered ? ' match these choices' : ' yet'}.</p>}
      {!!(rows ?? []).length && (
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const diff = r.action === 'UPDATE' ? changes(r.old_data, r.new_data) : [];
              const label = nameOf(r.new_data ?? r.old_data);
              return (
                <tr key={r.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.changed_at)}</td>
                  <td className="small">{whoName(r.changed_by)}</td>
                  <td className="small"><span className={`badge${r.action === 'DELETE' ? ' bad' : r.action === 'UPDATE' ? ' warn' : ''}`}>{ACTIONS[r.action] ?? r.action}</span> {nice(r.table_name)}{label ? <>: <strong>{short(label)}</strong></> : null}</td>
                  <td className="small">
                    {r.action === 'UPDATE' && !diff.length && <span className="muted">Saved with no change</span>}
                    {!!diff.length && (
                      <details>
                        <summary>{diff.length} {diff.length === 1 ? 'field' : 'fields'} changed</summary>
                        <ul className="list compact">{diff.map(([k, a, b]) => <li key={k}><span>{nice(k)}: {short(a)} → <strong>{short(b)}</strong></span></li>)}</ul>
                      </details>
                    )}
                    {r.action !== 'UPDATE' && <span className="muted">Record {short(r.record_id)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <p className="no-print">
          {page > 1 && <Link className="button" href={link(page - 1)}>← Newer</Link>}{' '}
          {page < pages && <Link className="button" href={link(page + 1)}>Older →</Link>}
        </p>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Changes to security settings</h2>
        <p className="small muted">Each time the Administrator changed who can see a section of the CRM (latest 40).</p>
        {!(slog ?? []).length && <p className="muted small">No changes yet.</p>}
        <ul className="list compact">{(slog ?? []).map((l) => (
          <li key={l.id}><span className="small">{secName[l.section] ?? l.section} · {roleName[l.role] ?? l.role}: {LEVELS[l.old_level]?.name ?? '—'} → <strong>{LEVELS[l.new_level]?.name ?? l.new_level}</strong></span>
            <span className="muted small">{whoName(l.changed_by)} · {fmtDateTime(l.changed_at)}</span></li>
        ))}</ul>
      </section>
    </main>
  );
}
