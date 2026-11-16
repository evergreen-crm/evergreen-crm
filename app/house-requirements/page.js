// 🧭 House requirements, by stage: before opening, after opening, every day and month, closing, documentation.
// A map only: every link opens a page or form that already exists (each one checks its own access).
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { ENTRY_TYPES } from '@/lib/entries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'House requirements · Evergreen' };

const P = (label, href, note) => ({ label, href, note });      // a page
const F = (kind, note) => ({ kind, note });                     // a form (lib/policyForms.js)

const STAGES = [
  { id: 'before', icon: '🏗', title: '1. Before opening the residence', intro: 'Everything that must be in place before the first person moves in.', groups: [
    ['Plan and contract', [P('Opening a new house: launch plan', '/launch', 'Milestones and the pre-opening documents checklist'), F('contract_start', 'Contract, insurance, licence, reporting dates')]],
    ['Safety of the building', [F('emergency_contact_directory', 'Post at every phone'), F('evacuation_plan', 'One per floor'), F('exposure_control_review'), F('it_asset', 'Every device'), F('it_vendor_register', 'Every cloud service'), F('hazard_assessment'), F('violence_risk_assessment'), F('emergency_supply_inventory'), F('emergency_equipment_check'), F('workplace_inspection')]],
    ['Staff', [P('Job applicants: pre-screening and references', '/hr/prescreen'), P('Staff files', '/hr'), P('Pay rates for offer letters', '/hr/pay-rates'), P('Staffing and shift lines', '/schedule?tab=teams'), P('Evergreen Academy: orientation and courses', '/academy'), P('Policy sign-off records', '/policies/records', 'Every policy signed and witnessed')]],
  ] },
  { id: 'after', icon: '🚪', title: '2. After the house opens', intro: 'The first days and weeks for each person and each new staff member.', groups: [
    ['Each person moving in', [F('youth_go_bag', 'Emergency profile and go-bag'), F('admission_decision', 'MCFD: before the youth is added'), P('Referrals and intake', '/intake'), P('Add a resident', '/residents/new'), F('mcfd_intake_checklist', 'MCFD'), F('emergency_info_sheet'), F('health_profile'), F('health_consent'), F('diet_allergy_plan'), F('community_map', 'CLBC, within 60 days')]],
    ['Each new staff member', [F('it_acceptable_use', 'Before any system access'), F('it_mfa_setup'), F('day1_orientation'), F('worker_safety_orientation'), F('ep_acknowledgement'), F('policy_acknowledgement'), F('confidentiality_agreement'), F('week1_tracker'), F('milestone_90day'), P('First-90-days reviews', '/probation')]],
    ['First month in the house', [F('emergency_drill', 'First drill'), F('daily_schedule'), F('cleaning_schedule'), F('menu_plan')]],
  ] },
  { id: 'running', icon: '🔁', title: '3. Keeping the house running', intro: 'What is done every day, every month and every year.', groups: [
    ['Every day', [P('Clock in and out', '/id#checkin'), P('My shift checklist', '/checklist'), P('Daily notes', '/notes'), P('Residents: medication record and incidents', '/homes', 'Open the house, then the person'), F('shift_handover'), F('cd_count', 'Controlled drugs'), P('Missing youth protocol', '/missing')]],
    ['Every week and month', [F('monthly_safety_inspection'), F('emergency_drill'), F('emergency_equipment_check'), F('supervision_record'), F('hr_compliance_report'), F('staffing_review'), F('monthly_financial_review'), F('ppe_inspection'), F('weekly_planner'), P('Monthly QA review', '/review', 'Due the 10th'), P('Program KPIs', '/kpi'), P('Problems to fix', '/action-items'), P('Timesheets', '/timesheet')]],
    ['Every quarter and year', [F('ep_quarterly_memo', 'January, April, October'), F('ohs_annual_dashboard'), F('it_self_audit', 'Yearly'), F('ci_trend_quarterly', 'MCFD, each quarter'), F('isr_file_audit', 'MCFD, January and July'), F('mcfd_self_assessment', 'MCFD, by July 31'), F('contract_tracking', 'Review monthly'), F('personnel_file_audit'), F('team_learning'), F('program_evaluation', 'MCFD'), F('annual_manual_review'), F('staff_details_check'), F('med_competency_check'), F('driver_review'), F('annual_financial_report'), F('program_quality_review'), F('annual_ep_review'), F('annual_health_checklist'), F('schedule_review'), P('Complaints register', '/complaints')]],
    ['When something happens', [F('it_breach_report', 'Lost device, phishing, wrong person'), F('ci_supervisor_response', 'MCFD, Category 1 or 2'), F('performance_improvement_plan'), F('abuse_report'), F('health_change_notice'), F('illness_injury_report'), F('med_error_report'), F('restraint_report'), F('ohs_incident_report'), F('barrier_report'), F('corrective_action'), F('funder_notification', 'MCFD')]],
  ] },
  { id: 'closing', icon: '🔚', title: '4. Closing the house', intro: 'When a house closes or a contract ends.', groups: [
    ['The house', [F('house_closing', 'Funder notice, records, property, keys')]],
    ['Each person', [F('mcfd_transition_checklist', 'MCFD'), F('med_disposal')]],
    ['Each staff member who leaves', [F('staff_offboarding'), F('exit_interview')]],
  ] },
  { id: 'docs', icon: '🗂', title: '5. Documentation', intro: 'Where the records are kept and how to print them.', groups: [
    ['Records', [P('All forms (MCFD and CLBC)', '/forms'), P('Document records by section', '/document'), P('Policies', '/policies'), P('Print documentation for funders', '/reports/daily'), P('Missing details in records', '/records'), P('File audits', '/qa/audits'), P('COA portal: standards and evidence', '/qa')]],
  ] },
];

export default async function HouseRequirements() {
  await requireUser(['admin', 'manager', 'staff']);
  const item = (x) => {
    if (x.kind) { const f = ENTRY_TYPES[x.kind]; if (!f) return null; return { label: `${f.icon ?? '📋'} ${f.label}`, href: `/forms/${x.kind}`, note: x.note ?? f.source, form: true }; }
    return x;
  };
  return (
    <main className="report">
      <h1>🧭 House requirements</h1>
      <p className="small muted">One map of everything a house needs, in the order it happens. Each line opens the page or form. “Form” lines are saved to the house’s, the person’s or the staff member’s file.</p>
      <p className="row no-print">{STAGES.map((s) => <a key={s.id} className="button secondary" href={`#${s.id}`}>{s.icon} {s.title.replace(/^\d\. /, '')}</a>)}</p>
      {STAGES.map((s) => (
        <section key={s.id} id={s.id} className="card">
          <h2 style={{ marginTop: 0 }}>{s.icon} {s.title}</h2>
          <p className="small muted">{s.intro}</p>
          {s.groups.map(([name, items]) => (
            <div key={name}>
              <h3 style={{ marginBottom: 4 }}>{name}</h3>
              <ul className="small" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map(item).filter(Boolean).map((x) => (
                  <li key={x.href + x.label} style={{ padding: '5px 0', borderBottom: '1px solid var(--line, #eee)' }}>
                    <Link href={x.href}><strong>{x.label}</strong></Link>{x.form ? <> <span className="badge">Form</span></> : null}
                    {x.note ? <span className="muted"> · {x.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
