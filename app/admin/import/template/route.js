// Downloads the Excel template for the staff bulk import (plan E3): a "Staff" sheet with one example row and
// drop-down lists (access level, house, position, full/part-time, program, certificate), plus "How to fill in".
import { getCurrentUser } from '@/lib/auth';
import { COLUMNS, ACCESS_CHOICES, EMPLOYMENT, PROGRAMS, CERT_PICKS, MAX_ROWS } from '@/lib/staffImport';
import { POSITIONS } from '@/lib/prescreen';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { supabase, user, profile } = await getCurrentUser();
  if (!user || !profile?.active || profile.role !== 'admin') return new Response('Not allowed', { status: 403 });
  const [{ data: homes }, { data: pos }] = await Promise.all([
    supabase.from('homes').select('name').order('name'),
    supabase.rpc('pay_positions'),
  ]);
  const positions = (pos ?? []).length ? pos.map((x) => (typeof x === 'string' ? x : x.position ?? x.pay_positions)).filter(Boolean) : POSITIONS;
  const lists = {
    access: ACCESS_CHOICES.map((a) => a.label), houses: (homes ?? []).map((h) => h.name), positions,
    employment: EMPLOYMENT, programs: PROGRAMS, certs: CERT_PICKS,
  };

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Evergreen Community Care';
  const ws = wb.addWorksheet('Staff', { views: [{ state: 'frozen', ySplit: 1 }] });
  const how = wb.addWorksheet('How to fill in');
  const ls = wb.addWorksheet('Lists');

  ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5A34' } };
  head.alignment = { wrapText: true, vertical: 'middle' };
  head.height = 36;
  const ex = ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, c.key === 'full_name' ? 'EXAMPLE — Jordan Example (delete this row)' : c.example])));
  ex.font = { italic: true, color: { argb: 'FF8A8A8A' } };
  for (const c of COLUMNS) if (c.date || ['phone', 'emergency_phone', 'hire_date'].includes(c.key)) ws.getColumn(c.key).numFmt = '@';

  // Drop-down lists from the "Lists" sheet.
  const order = ['access', 'houses', 'positions', 'employment', 'programs', 'certs'];
  const titles = { access: 'Access level', houses: 'House', positions: 'Position', employment: 'Full-time or part-time', programs: 'Program', certs: 'Certificate' };
  order.forEach((k, i) => {
    const col = ls.getColumn(i + 1); col.width = 30;
    ls.getCell(1, i + 1).value = titles[k]; ls.getCell(1, i + 1).font = { bold: true };
    (lists[k].length ? lists[k] : ['(none yet)']).forEach((v, j) => { ls.getCell(j + 2, i + 1).value = v; });
  });
  const colLetter = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  COLUMNS.forEach((c, i) => {
    if (!c.list) return;
    const li = order.indexOf(c.list) + 1; const n = Math.max(lists[c.list].length, 1);
    const free = c.list === 'certs' || c.list === 'positions';   // other names can be typed in
    for (let r = 2; r <= MAX_ROWS + 2; r++) {
      ws.getCell(`${colLetter(i + 1)}${r}`).dataValidation = {
        type: 'list', allowBlank: true, showErrorMessage: !free, errorStyle: free ? 'information' : 'stop',
        formulae: [`Lists!$${colLetter(li)}$2:$${colLetter(li)}$${n + 1}`],
        error: 'Choose from the list.',
      };
    }
  });

  how.getColumn(1).width = 110;
  [
    ['Evergreen Community Care — staff import', true],
    [''],
    ['1. Fill in one row per person on the “Staff” sheet. Delete the grey EXAMPLE row (or leave it; it is skipped).'],
    ['2. Required: Full name, Email, Access level. Frontline and Program Coordinator staff also need a House.'],
    ['3. Use the drop-down lists (Access level, House, Position, Full-time or part-time, Program, Certificate).'],
    ['4. Dates: type them as YYYY-MM-DD, for example 2027-01-04.'],
    ['5. Offer letters: a person gets an offer letter only when Position, Full-time or part-time, and Start date are all filled in.'],
    ['   On the preview page you choose whether offer letters are sent now (new hires) or not (staff who already signed a contract).'],
    ['6. Certificates (up to 3): name, date issued and expiry date. They go into the staff file as “to verify” so HR checks the originals; expiry reminders start right away.'],
    ['7. Save the file and upload it on Admin → Staff import. Nothing is added until you check the preview and press Import.'],
    [`8. Up to ${MAX_ROWS} people per file. Each person signs in with a code sent to their email; no passwords.`],
    [''],
    ['Access levels: ' + ACCESS_CHOICES.map((a) => a.label).join(', ') + '. (The Administrator account is never imported.)'],
    ['Houses in the portal now: ' + (lists.houses.join(', ') || 'none yet — add houses on the Admin page first.')],
  ].forEach(([t, bold], i) => { const c = how.getCell(i + 1, 1); c.value = t; c.alignment = { wrapText: true }; if (bold) c.font = { bold: true, size: 14 }; });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="evergreen-staff-import-template.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
