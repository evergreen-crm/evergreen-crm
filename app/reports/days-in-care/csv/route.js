// Days-in-care report (plan E5) as a CSV file for Excel.
import { getCurrentUser } from '@/lib/auth';
import { daysInCareCsv } from '@/lib/daysInCare';
import { loadDaysInCare, canSeeDaysInCare } from '@/lib/daysInCareData';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { supabase, user, profile } = await getCurrentUser();
  if (!user || !profile?.active || !canSeeDaysInCare(profile)) return new Response('Not allowed', { status: 403 });
  const thisYear = new Date().getUTCFullYear();
  const y = Number(new URL(request.url).searchParams.get('year'));
  const year = y >= 2020 && y <= thisYear + 1 ? y : thisYear;
  const data = await loadDaysInCare(supabase, year);
  return new Response('﻿' + daysInCareCsv(year, data), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="evergreen-days-in-care-${year}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
