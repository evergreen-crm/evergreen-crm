// "Money" tab: resident's personal funds, with a running balance.
import EntryForm from '@/app/components/EntryForm';
import { todayISO } from '@/lib/options';
import EntryList from '@/app/components/EntryList';

export default async function Money({ supabase, resident, isAdmin }) {
  const { data: rows } = await supabase.from('entries').select('*, author:created_by(full_name)')
    .eq('resident_id', resident.id).eq('kind', 'money')
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  const balance = (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const month = todayISO().slice(0, 7);
  const spentMonth = (rows ?? []).filter((r) => r.entry_date.startsWith(month) && r.amount < 0).reduce((s, r) => s - Number(r.amount), 0);
  const noReceipt = (rows ?? []).filter((r) => r.amount < 0 && r.data?.receipt === 'No').length;
  const path = `/residents/${resident.id}`;

  return (
    <section>
      <div className="stats">
        <div className={`stat ${balance < 0 ? 'bad' : ''}`}><strong>${balance.toFixed(2)}</strong><span>balance on hand</span></div>
        <div className="stat"><strong>${spentMonth.toFixed(2)}</strong><span>spent this month</span></div>
        <div className={`stat ${noReceipt ? 'warn' : ''}`}><strong>{noReceipt}</strong><span>purchases without a receipt</span></div>
      </div>
      <p className="muted small">Count the cash at each shift change; the count should match the balance. Keep every receipt.</p>
      <EntryForm kind="money" homeId={resident.home_id} residentId={resident.id} path={path} title="Money in or out" />
      <EntryList entries={rows} path={path} isAdmin={isAdmin} empty="No money records yet." />
    </section>
  );
}
