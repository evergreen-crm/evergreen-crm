// One division: its areas in a grid, governing documents, and who has access.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { findDivision, isDone } from '@/lib/divisions';
import { getGrants, canSee } from '@/lib/portal';
import { todayISO } from '@/lib/options';
import { grantAccess, revokeAccess } from '@/app/portal/actions';
import PrintButton from '@/app/PrintButton';

export default async function DivisionPage({ params }) {
  const { division } = await params;
  const { supabase, profile } = await requireUser(['admin', 'manager', 'staff']);
  const full = findDivision(division);
  if (!full) notFound();
  const grants = await getGrants(supabase, profile);
  if (!canSee(profile, grants, full)) notFound();
  const areas = full.areas;
  const isAdmin = profile.role === 'admin';
  const today = todayISO();

  const [{ data: rows }, { data: access }, { data: people }] = await Promise.all([
    supabase.from('records').select('area, status, due_date').eq('division', division),
    isAdmin ? supabase.from('portal_access').select('profile_id, can_edit, profiles:profile_id(full_name, role)').eq('division', division) : { data: [] },
    isAdmin ? supabase.from('profiles').select('id, full_name, role').in('role', ['staff', 'manager']).eq('active', true).order('full_name') : { data: [] },
  ]);
  const count = {};
  for (const r of rows ?? []) {
    const c = (count[r.area] ??= { total: 0, open: 0, overdue: 0 });
    c.total++; if (!isDone(r)) { c.open++; if (r.due_date && r.due_date < today) c.overdue++; }
  }

  return (
    <main style={{ '--div': full.color }}>
      <p className="small no-print"><Link href="/portal">← Portal</Link></p>
      <div className="div-banner">
        <span className="div-icon">{full.icon}</span>
        <div>
          <h1>{full.num}. {full.title}</h1>
          <p>{full.roles} · {full.standards}</p>
        </div>
        <span className="no-print"><PrintButton label="Print" /></span>
      </div>
      <p className="muted small">Governing documents: {full.docs.join(' · ')}</p>

      <div className="area-grid">
        {areas.map((a) => {
          const c = count[a.key] ?? { total: 0, open: 0, overdue: 0 };
          return (
            <Link key={a.key} href={`/portal/${division}/${a.key}`} className="area-tile">
              <span className="std">{a.std}</span>
              <strong>{a.title}</strong>
              <span className="small muted">{a.summary}</span>
              <span className="small">
                {c.total} record{c.total === 1 ? '' : 's'}
                {c.open > 0 && <> · <span className="badge warn">{c.open} open</span></>}
                {c.overdue > 0 && <> <span className="badge bad">{c.overdue} overdue</span></>}
              </span>
            </Link>
          );
        })}
      </div>

      {isAdmin && (
        <section className="card no-print">
          <h2>Who has access to this division</h2>
          <p className="muted small">
            Only you (admin) can see this division until you add people here. Nobody else, including managers, can see it.
            “View and add” lets a person see all records and add their own. “Can edit everyone’s records” also lets them edit others’ records.
          </p>
          {access?.length === 0 && <p className="muted">No one else has been added.</p>}
          {access?.length > 0 && (
            <table>
              <thead><tr><th>Person</th><th>Access</th><th></th></tr></thead>
              <tbody>
                {access.map((g) => (
                  <tr key={g.profile_id}>
                    <td>{g.profiles?.full_name} <span className="muted small">· {g.profiles?.role}</span></td>
                    <td>{g.can_edit ? 'View, add and edit' : 'View and add'}</td>
                    <td>
                      <form action={revokeAccess}>
                        <input type="hidden" name="division" value={division} />
                        <input type="hidden" name="profile_id" value={g.profile_id} />
                        <button className="link small">Remove</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form action={grantAccess} className="row">
            <input type="hidden" name="division" value={division} />
            <label>Person
              <select name="profile_id" required defaultValue="">
                <option value="" disabled>Choose…</option>
                {people?.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" name="can_edit" /> Can edit everyone’s records</label>
            <button>Give access</button>
          </form>
        </section>
      )}
    </main>
  );
}
