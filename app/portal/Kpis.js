// Live KPIs (QA Binder s.5.3), calculated from the records in the system.
import { writtenDue } from '@/lib/incidents';
import { programsFor } from '@/lib/requirements';
import { certStatus } from '@/lib/hr';
import { todayISO, fmtDate } from '@/lib/options';

function quarterStart(iso) {
  const y = iso.slice(0, 4); const m = Number(iso.slice(5, 7));
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}

function Kpi({ label, value, target, good }) {
  return (
    <div className={`stat ${good === false ? 'bad' : good === true ? '' : 'warn'}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <span className="small muted">Target: {target}</span>
    </div>
  );
}

export default async function Kpis({ supabase }) {
  const today = todayISO();
  const qStart = quarterStart(today);
  const yStart = today.slice(0, 4) + '-01-01';

  const [{ data: inc }, { data: errs }, { data: homes }, { data: drills }, { data: certs }, { data: cap }, { data: complaints }] = await Promise.all([
    supabase.from('incidents').select('occurred_on, is_critical, is_urgent, incident_class, incident_type, physical_intervention, written_report_sent_on, residents(funder, care_type)').gte('occurred_on', yStart),
    supabase.from('med_administrations').select('id').eq('status', 'Error').gte('admin_date', qStart),
    supabase.from('homes').select('id'),
    supabase.from('entries').select('home_id').eq('kind', 'fire_drill').gte('entry_date', qStart),
    supabase.from('certifications').select('expires_on, cert_type, profiles:profile_id(active)'),
    supabase.from('records').select('status, due_date').eq('division', 'qa').eq('area', 'cap'),
    supabase.from('records').select('status, due_date').eq('division', 'program').eq('area', 'std-b').eq('record_type', 'Complaint'),
  ]);

  const q = (inc ?? []).filter((i) => i.occurred_on >= qStart);
  const crit = q.filter((i) => i.is_critical);
  const onTime = crit.filter((i) => i.written_report_sent_on && i.written_report_sent_on <= writtenDue(i, programsFor(i.residents ?? {})[0]?.key ?? 'mcfd'));
  const restraints = q.filter((i) => i.physical_intervention).length;
  const missing = q.filter((i) => /missing/i.test(i.incident_type ?? '')).length;
  const drilled = new Set((drills ?? []).map((d) => d.home_id));
  const crcExpired = (certs ?? []).filter((c) => c.profiles?.active !== false && /criminal/i.test(c.cert_type) && certStatus(c.expires_on).key === 'expired').length;
  const certExpired = (certs ?? []).filter((c) => c.profiles?.active !== false && certStatus(c.expires_on).key === 'expired').length;
  const capDue = (cap ?? []).filter((c) => c.due_date && c.due_date < today);
  const capPct = capDue.length ? Math.round(100 * capDue.filter((c) => c.status === 'Complete').length / capDue.length) : 100;
  const complaintsLate = (complaints ?? []).filter((c) => c.status !== 'Complete' && c.due_date && c.due_date < today).length;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 100);

  return (
    <section>
      <h2>This quarter (since {fmtDate(qStart)})</h2>
      <div className="stats">
        <Kpi label="Critical incidents" value={crit.length} target="decreasing trend" />
        <Kpi label="Critical reports sent on time" value={`${pct(onTime.length, crit.length)}%`} target="100%" good={pct(onTime.length, crit.length) === 100} />
        <Kpi label="Physical interventions / restraints" value={restraints} target="zero preferred" good={restraints === 0} />
        <Kpi label="Missing youth incidents" value={missing} target="zero" good={missing === 0} />
        <Kpi label="Medication errors" value={errs?.length ?? 0} target="zero" good={!errs?.length} />
        <Kpi label="Houses with a fire drill this quarter" value={`${drilled.size} / ${homes?.length ?? 0}`} target="100%" good={drilled.size >= (homes?.length ?? 0)} />
      </div>
      <h2>Right now</h2>
      <div className="stats">
        <Kpi label="Expired criminal record checks (active staff)" value={crcExpired} target="zero" good={crcExpired === 0} />
        <Kpi label="Expired certificates (active staff)" value={certExpired} target="zero" good={certExpired === 0} />
        <Kpi label="Corrective actions done by target date" value={`${capPct}%`} target="90%+" good={capPct >= 90} />
        <Kpi label="Complaints past 10 business days" value={complaintsLate} target="zero" good={complaintsLate === 0} />
      </div>
      <h2>This year</h2>
      <div className="stats">
        <Kpi label="All incidents" value={inc?.length ?? 0} target="decreasing year over year" />
        <Kpi label="Critical incidents" value={(inc ?? []).filter((i) => i.is_critical).length} target="decreasing year over year" />
        <Kpi label="Behavioural incidents" value={(inc ?? []).filter((i) => i.incident_class === 'Behavioural').length} target="decreasing trend" />
      </div>
    </section>
  );
}
