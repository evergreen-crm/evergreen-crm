// Bulk import of real staff (plan E3): the template's columns, reading the filled-in file, and checking each row.
// The Administrator downloads the Excel template, fills in one row per person, uploads it, checks the preview,
// then imports. Each person is added the same way as "Give a person access" on the Admin page.
import 'server-only';
import { LEVELS, GROUPS } from '@/lib/levels';

export const MAX_ROWS = 100;
export const CERT_SLOTS = 3;
export const EMPLOYMENT = ['Full-time', 'Part-time'];
export const PROGRAMS = ['MCFD', 'CLBC', 'Both'];
export const CERT_PICKS = ['First Aid / CPR Level C', 'CPI or other de-escalation training', 'FoodSafe Level 1', 'Medication administration',
  'Criminal record check (CRRA)', 'Class 5 driver’s licence', 'WHMIS 2015', 'Trauma-Informed Practice', 'Social Service Worker diploma'];

// Access levels that can be imported (the Administrator account is never imported).
export const ACCESS_CHOICES = [
  ...LEVELS.filter((l) => l.level >= 1 && l.level <= 7).map((l) => ({ label: l.name, value: String(l.level), level: l.level, group: null })),
  ...GROUPS.map((g) => ({ label: g.name, value: g.key, level: g.level, group: g.key })),
];

export const COLUMNS = [
  { key: 'full_name', label: 'Full name *', width: 26, example: 'Jordan Example' },
  { key: 'email', label: 'Email *', width: 30, example: 'jordan.example@email.com' },
  { key: 'phone', label: 'Cell phone', width: 16, example: '604 555 0123' },
  { key: 'access', label: 'Access level *', width: 24, example: 'Frontline', list: 'access' },
  { key: 'house', label: 'House (Frontline and Program Coordinator)', width: 28, example: '', list: 'houses' },
  { key: 'position', label: 'Position', width: 26, example: 'Youth Worker', list: 'positions' },
  { key: 'employment_type', label: 'Full-time or part-time', width: 20, example: 'Full-time', list: 'employment' },
  { key: 'hours_per_week', label: 'Hours per week', width: 14, example: 36 },
  { key: 'program', label: 'Program (MCFD / CLBC / Both)', width: 16, example: 'MCFD', list: 'programs' },
  { key: 'hire_date', label: 'Start date (YYYY-MM-DD)', width: 18, example: '2027-01-04', date: true },
  { key: 'home_address', label: 'Home address', width: 36, example: '123 Main St, Surrey, BC V3T 1A1' },
  { key: 'emergency_contact', label: 'Emergency contact name', width: 24, example: 'Sam Example (spouse)' },
  { key: 'emergency_phone', label: 'Emergency contact phone', width: 18, example: '604 555 0456' },
  ...Array.from({ length: CERT_SLOTS }, (_, i) => [
    { key: `cert${i + 1}_name`, label: `Certificate ${i + 1}`, width: 26, example: i === 0 ? 'First Aid / CPR Level C' : '', list: 'certs' },
    { key: `cert${i + 1}_issued`, label: `Certificate ${i + 1} issued (YYYY-MM-DD)`, width: 18, example: i === 0 ? '2025-06-01' : '', date: true },
    { key: `cert${i + 1}_expires`, label: `Certificate ${i + 1} expires (YYYY-MM-DD)`, width: 18, example: i === 0 ? '2028-06-01' : '', date: true },
  ]).flat(),
];

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const cellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.text) return String(v.text);                                  // hyperlink (e.g. an email address)
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.result != null) return cellText(v.result);                    // formula
    return '';
  }
  return String(v);
};

// Reads the uploaded file (Excel .xlsx or CSV) into rows of { key: text }.
export async function readUpload(file) {
  const name = String(file?.name ?? '');
  const buf = Buffer.from(await file.arrayBuffer());
  let table = [];
  if (/\.csv$/i.test(name) || file.type === 'text/csv') {
    table = parseCsv(buf.toString('utf8').replace(/^﻿/, ''));
  } else {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Staff') ?? wb.worksheets[0];
    if (!ws) throw new Error('The file has no sheets.');
    ws.eachRow({ includeEmpty: false }, (row) => { table.push((row.values ?? []).slice(1).map(cellText)); });
  }
  if (!table.length) throw new Error('The file is empty.');
  // Find the header row (the first row that has "Full name" and "Email").
  const hi = table.findIndex((r) => r.some((c) => norm(c).startsWith('fullname')) && r.some((c) => norm(c).startsWith('email')));
  if (hi < 0) throw new Error('Could not find the header row. Use the downloaded template and keep its first row.');
  const head = table[hi].map(norm);
  const colIndex = Object.fromEntries(COLUMNS.map((c) => [c.key, head.findIndex((h) => h && h === norm(c.label))]));
  // Allow slightly changed headers: match on the start of the label.
  for (const c of COLUMNS) if (colIndex[c.key] < 0) colIndex[c.key] = head.findIndex((h) => h && h.startsWith(norm(c.label).slice(0, 12)));
  const rows = [];
  for (let i = hi + 1; i < table.length; i++) {
    const r = table[i];
    const obj = { _row: i + 1 };
    for (const c of COLUMNS) obj[c.key] = colIndex[c.key] >= 0 ? String(r[colIndex[c.key]] ?? '').trim() : '';
    if (/^example/i.test(obj.full_name) || norm(obj.full_name) === 'jordanexample') continue;   // the template's example row
    if (COLUMNS.every((c) => !obj[c.key])) continue;                                          // empty row
    rows.push(obj);
  }
  return rows;
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function toISODate(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);                 // Nov 3, 2026
  if (m && MONTHS[m[1].toLowerCase()]) return valid(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);                   // 3 Nov 2026
  if (m && MONTHS[m[2].toLowerCase()]) return valid(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return undefined;   // not understood (07/08/2026 is ambiguous, so it isn't guessed)
}
function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 1950 && y <= 2100
    ? dt.toISOString().slice(0, 10) : undefined;
}
export const cleanPhone = (value) => {
  if (!value) return null;
  const digits = String(value).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
};

// Checks each row. ctx: { homes: [{id,name}], positions: [..], existingEmails: Set }
export function checkRows(rows, ctx) {
  const seen = new Map();
  return rows.map((r) => {
    const errors = []; const warnings = [];
    const email = r.email.toLowerCase();
    if (!r.full_name) errors.push('Full name is missing');
    if (!email) errors.push('Email is missing');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) errors.push('Email doesn’t look right');
    else if (ctx.existingEmails.has(email)) errors.push('Someone with this email is already in the portal');
    else if (seen.has(email)) errors.push(`Same email as row ${seen.get(email)}`);
    if (email) seen.set(email, r._row);
    const access = ACCESS_CHOICES.find((a) => norm(a.label) === norm(r.access) || a.value === String(r.access).trim());
    if (!access) errors.push(r.access ? `Access level “${r.access}” isn’t one of the choices` : 'Access level is missing');
    const home = r.house ? ctx.homes.find((h) => norm(h.name) === norm(r.house)) : null;
    if (r.house && !home) errors.push(`House “${r.house}” isn’t in the portal (add it on Admin first, or check the spelling)`);
    if (access && !access.group && access.level <= 2 && !home && !r.house) errors.push(`${access.label} staff need a house`);
    const position = r.position ? (ctx.positions.find((p) => norm(p) === norm(r.position)) ?? r.position) : null;
    if (r.position && !ctx.positions.some((p) => norm(p) === norm(r.position))) warnings.push(`Position “${r.position}” has no pay rate yet (the offer letter waits until it has one)`);
    const type = r.employment_type ? EMPLOYMENT.find((t) => norm(t) === norm(r.employment_type)) : null;
    if (r.employment_type && !type) errors.push('Full-time or part-time: use Full-time or Part-time');
    const hours = r.hours_per_week === '' ? null : Number(r.hours_per_week);
    if (hours !== null && !(hours > 0 && hours <= 60)) errors.push('Hours per week must be between 1 and 60');
    const program = r.program ? PROGRAMS.find((p) => norm(p) === norm(r.program)) : null;
    if (r.program && !program) errors.push('Program: use MCFD, CLBC or Both');
    const hire = toISODate(r.hire_date);
    if (hire === undefined) errors.push('Start date: use YYYY-MM-DD (for example 2027-01-04)');
    const phone = cleanPhone(r.phone);
    if (r.phone && !/^\+\d{11,15}$/.test(phone ?? '')) errors.push('Cell phone doesn’t look right');
    const certs = [];
    for (let i = 1; i <= CERT_SLOTS; i++) {
      const name = r[`cert${i}_name`]; const issued = toISODate(r[`cert${i}_issued`]); const expires = toISODate(r[`cert${i}_expires`]);
      if (!name && !r[`cert${i}_issued`] && !r[`cert${i}_expires`]) continue;
      if (!name) { errors.push(`Certificate ${i}: the name is missing`); continue; }
      if (issued === undefined) errors.push(`Certificate ${i} issued: use YYYY-MM-DD`);
      if (expires === undefined) errors.push(`Certificate ${i} expires: use YYYY-MM-DD`);
      if (expires && expires < new Date().toISOString().slice(0, 10)) warnings.push(`Certificate ${i} (${name}) has expired`);
      certs.push({ name: name.slice(0, 200), issued: issued || null, expires: expires || null });
    }
    const jobComplete = position && type && hire;
    if (!jobComplete && (position || type || hire)) warnings.push('No offer letter: it needs the position, full-time or part-time, and the start date');
    if (!r.emergency_contact || !r.emergency_phone) warnings.push('No emergency contact');
    return {
      row: r._row, ok: errors.length === 0, errors, warnings,
      person: {
        full_name: r.full_name.slice(0, 120), email, phone, access: access ? { level: access.level, group: access.group, label: access.label } : null,
        home_id: home?.id ?? null, house: home?.name ?? null, position: position ? String(position).slice(0, 120) : null, employment_type: type ?? null,
        hours_per_week: hours, program: program ?? null, hire_date: hire || null, home_address: r.home_address.slice(0, 200) || null,
        emergency_contact: r.emergency_contact.slice(0, 120) || null, emergency_phone: r.emergency_phone.slice(0, 40) || null, certs,
      },
    };
  });
}
