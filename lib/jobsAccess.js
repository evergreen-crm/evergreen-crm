// Who can use Jobs & applications (plan B5): HR and the Administrator change things; the CEO can read.
import { levelOf } from '@/lib/levels';

export const canEditJobs = (p) => p?.role === 'admin' || p?.staff_group === 'hr';
export const canSeeJobs = (p) => canEditJobs(p) || (levelOf(p) >= 7 && !p?.staff_group);
