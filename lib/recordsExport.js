// Monthly records download (plan E4): every portal record as Excel workbooks, one per area, one sheet per table.
// A stopgap backup until the nightly OneDrive backup is set up. Server only; the Administrator is checked first.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export const AREAS = [
  { key: 'people', name: 'People and HR', match: /^(profiles|staff_|trainings|certifications|onboarding|offer_|prescreen|reference_requests|probation|id_cards|course_attempts|orientation_|lesson_sessions|policy_acks|policy_record|paperwork_pdfs|job_|survey_|suggestions|career_ladder|manager_homes|family_links|person_section_access|portal_access|access_reviews|kpi_)/ },
  { key: 'care', name: 'Residents and care', match: /^(residents|resident_|shift_notes|entries|entry_versions|records$|incidents|med_|medications|goals|goal_steps|care_plans|plan_log|appointments|missing_|night_checks|intake_|documents|complaint|emergency_alerts|activity_plans)/ },
  { key: 'time', name: 'Time and pay', match: /^(time_|shifts|shift_absences|shift_pickups|shift_permission|schedule_|pay_|wage_grid|payroll_exports|protected_days|location_checkins|staffing_changes)/ },
  { key: 'houses', name: 'Houses, compliance and forms', match: /^(homes|house_|inventory_|launch_|qa_|duty_|duties|contracts|funders|action_item|shift_checklist|record_gap|policies|policy_versions|course_video_versions|training_videos)/ },
  { key: 'system', name: 'Audit log and system', match: /.*/ },   // everything else
];

// Never exported: search index, quiz answer keys, rate limits; and secret columns (codes, link tokens, hashes).
const SKIP_TABLES = new Set(['ask_chunks', 'ask_indexed', 'course_keys', 'suggestion_rate']);
const SECRET_COL = /(^|_)(token|otp|secret|password)(_|$)|(^|_)(session|code)_hash$|^embedding$/i;   // document fingerprints (doc_hash…) are kept
const BIG_COL = /signature_image|^sig$|_sig$|signature_png/i;   // drawn signatures (images): left out, they stay in the signed PDFs

export const areaOf = (table) => AREAS.find((a) => a.match.test(table)).key;

const cell = (v) => {
  if (v == null) return null;
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string' && v.length > 32000) return v.slice(0, 32000) + ' …(cut: longer than an Excel cell)';
  return v;
};

export async function buildArea(areaKey) {
  const area = AREAS.find((a) => a.key === areaKey);
  if (!area) throw new Error('Unknown area');
  const admin = createAdminClient();
  const { data: list, error } = await admin.rpc('export_table_list');
  if (error) throw new Error(error.message);
  const tables = (list ?? []).filter((t) => !SKIP_TABLES.has(t.table_name) && areaOf(t.table_name) === areaKey);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Evergreen Community Care';
  const summary = wb.addWorksheet('Contents');
  summary.columns = [{ header: 'Table', key: 't', width: 34 }, { header: 'Rows', key: 'n', width: 10 }, { header: 'Note', key: 'note', width: 70 }];
  summary.getRow(1).font = { bold: true };
  let total = 0; const usedNames = new Set();
  for (const t of tables) {
    const cols = t.columns.filter((c) => !SECRET_COL.test(c) && !BIG_COL.test(c));
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error: e } = await admin.from(t.table_name).select(cols.map((c) => `"${c}"`).join(',')).range(from, from + 999);
      if (e) { summary.addRow({ t: t.table_name, n: 0, note: 'Could not read: ' + e.message }); break; }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
      if (rows.length >= 200000) break;
    }
    let name = t.table_name.slice(0, 31); let k = 2;
    while (usedNames.has(name)) name = t.table_name.slice(0, 28) + '_' + k++;
    usedNames.add(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.min(40, Math.max(10, c.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => [c, cell(r[c])])));
    const hidden = t.columns.length - cols.length;
    summary.addRow({ t: t.table_name, n: rows.length, note: hidden ? `${hidden} column(s) left out (codes, link tokens or drawn signatures)` : '' });
    total += rows.length;
  }
  summary.addRow({});
  summary.addRow({ t: `${area.name}: ${tables.length} tables, ${total} rows`, note: `Downloaded ${new Date().toISOString()} (UTC). Uploaded files (PDFs, photos) are not included, only their records.` });
  const buf = await wb.xlsx.writeBuffer();
  return { buf, tables: tables.length, rows: total, name: area.name };
}

export async function areaSummary() {
  const admin = createAdminClient();
  const { data: list } = await admin.rpc('export_table_list');
  const out = Object.fromEntries(AREAS.map((a) => [a.key, 0]));
  for (const t of list ?? []) if (!SKIP_TABLES.has(t.table_name)) out[areaOf(t.table_name)] += 1;
  return out;
}
