// Evergreen staff ID numbers: EVG-YYMM-POS-P-NNNN, built automatically in the database (supabase/staff-id-numbers.sql).
// Example: EVG-2610-YW-M-0007 = hired October 2026 · Youth Worker · MCFD · staff #0007.
export const POSITION_CODES = {
  YW: 'Youth Worker', PC: 'Program Coordinator', HR: 'HR', PY: 'Payroll', PM: 'Program Manager',
  DO: 'Director of Operations', ED: 'Executive Director', CS: 'CSO', CE: 'CEO', AD: 'Administrator',
};
export const PROGRAM_CODES = { M: 'MCFD', C: 'CLBC', B: 'MCFD and CLBC' };

export function decodeStaffId(no) {
  const m = /^EVG-(\d{2})(\d{2})-([A-Z]{2})-([MCB])-(\d{4})$/.exec(no ?? '');
  if (!m) return null;
  const hired = new Date(Date.UTC(2000 + Number(m[1]), Number(m[2]) - 1, 15))
    .toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { hired, position: POSITION_CODES[m[3]] ?? m[3], program: PROGRAM_CODES[m[4]], number: m[5] };
}

export const describeStaffId = (no) => {
  const d = decodeStaffId(no);
  return d ? `Hired ${d.hired} · ${d.position} · ${d.program} · staff #${d.number}` : null;
};
