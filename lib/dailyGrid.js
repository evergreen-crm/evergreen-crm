// The daily grid: which record kinds are entered together, for each program.
import { ENTRY_TYPES } from '@/lib/entries';

export const DAILY_KINDS = { MCFD: ['day_book', 'wellness_check'], CLBC: ['clbc_day', 'clbc_wellness'] };
export const dailyKindsFor = (program) => DAILY_KINDS[program] ?? [];

// The inputs for one kind, in the order the record lists them. Every field is a grid cell.
export const gridFields = (kind) => ENTRY_TYPES[kind]?.fields ?? [];
