// Add an issue by hand (e.g. something found on a walk-through or an inspection).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { levelOf, personLabel } from '@/lib/levels';
import { redirect } from 'next/navigation';
import { AREAS } from '@/lib/kpis';
import { addDaysISO, todayISO } from '@/lib/options';
import { createActionItem } from '../actions';

export default async function NewActionItem({ searchParams }) {
  const { supabase, user, profile } = await requireUser(['admin', 'manager', 'staff']);
  if (levelOf(profile) < 2) redirect('/action-items');
  const sp = await searchParams;
  const [{ data: people }, { data: homes }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, level').eq('active', true).neq('role', 'family').order('full_name'),
    supabase.from('homes').select('id, name').order('name'),
  ]);
  return (
    <main>
      <p className="small"><Link href="/action-items">← Action required</Link></p>
      <h1>Add an issue</h1>
      {sp.error && <p className="message">{sp.error}</p>}
      <form action={createActionItem} className="card">
        <label>Issue<input name="title" required placeholder="e.g. First aid kit missing items at Maple House" /></label>
        <label>Details<textarea name="details" rows={3} /></label>
        <div className="row">
          <label>Area<select name="category" defaultValue="compliance">{AREAS.map((a) => <option key={a.key} value={a.key}>{a.num}. {a.title}</option>)}</select></label>
          <label>Priority<select name="severity" defaultValue="yellow"><option value="yellow">🟡 Attention required</option><option value="red">🔴 Immediate action</option></select></label>
        </div>
        <div className="row">
          <label>House<select name="home_id" defaultValue=""><option value="">— Organization-wide —</option>{homes?.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
          <label>Owner<select name="owner_id" defaultValue={user.id}>{people?.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({personLabel(p)})</option>)}</select></label>
          <label>Due date<input type="date" name="due_date" defaultValue={addDaysISO(todayISO(), 7)} required /></label>
        </div>
        <label>Link to the record (optional)<input name="link" placeholder="/residents/… or /homes/…" /></label>
        <button>Save issue</button>
      </form>
    </main>
  );
}
