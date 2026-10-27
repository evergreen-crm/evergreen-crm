// 👥 Staffing per shift (supabase/staffing-changes.sql).
// One-tap staffing choices (days / evenings / awake nights / extra 3–7 pm).
export const PRESETS = [
  { key: '1', label: '1 staff', hint: '1 on every shift', v: [1, 1, 1, 0] },
  { key: '1p', label: '1 staff + 3–7 pm', hint: '1 on every shift, plus an extra 3–7 pm', v: [1, 1, 1, 1] },
  { key: '2de', label: '2 staff days & evenings', hint: '2 on days and evenings, 1 awake night', v: [2, 2, 1, 0] },
  { key: '2', label: '2 staff', hint: '2 on every shift', v: [2, 2, 2, 0] },
];
