// Shows whether something is for MCFD only, CLBC only, or both.
import { programLabel } from '@/lib/onboarding';

export default function ProgramBadge({ program }) {
  const k = program ?? 'Both';
  return <span className={`prog prog-${k}`}>{programLabel(k)}</span>;
}
