// The "before opening" tick list (plan E2). Keys are saved in golive_items; don't rename a key once used.
export const GOLIVE_GROUPS = [
  ['Legal review', [
    ['lawyer_handbook', 'Lawyer reviewed the Staff Rules and Regulations Handbook'],
    ['lawyer_offer', 'Lawyer reviewed offer letter version 3 (employment agreement) and contract ECC-CON-2026-001'],
    ['lawyer_policy_lock', 'Lawyer reviewed the policy lock (staff can’t reopen signed policies) and signature records'],
    ['lawyer_abuse_form', 'Lawyer reviewed the suspected abuse or neglect report wording (CFCSA s.14, Adult Guardianship Act)'],
    ['lawyer_bullying', 'Lawyer reviewed the Bullying and Harassment Prevention Policy ECC-HR-BH-2026-001'],
    ['lawyer_jobs', 'Lawyer reviewed the online job application questions (BC Human Rights Code)'],
  ]],
  ['Accounts and paid plans', [
    ['paid_supabase', 'Supabase on a paid plan (daily backups) before real resident records go in'],
    ['paid_vercel', 'Vercel on a paid plan'],
    ['backup_account', 'Microsoft backup@ account made, for the nightly OneDrive backup'],
    ['twilio', 'Twilio account for emergency and sick-call text messages (optional)'],
    ['anthropic_key', 'Anthropic API key for full answers in Ask Evergreen (optional)'],
    ['leaked_pw', 'Supabase “leaked password protection” switched on (Authentication settings)'],
  ]],
  ['Clean-up', [
    ['old_copies', 'Old CRM copies deleted from the office computer (Documents: evergreen-crm, evergreen-online, evergreen-upload)'],
    ['vault_password', 'Test password removed from Supabase Vault (claude_test_login_password)'],
    ['test_data', 'Test house “Test Home - Maple House” and its test residents archived or removed'],
  ]],
  ['Real information entered', [
    ['real_houses', 'Each real house entered with address, licence number, phones, program and location (for clock-in)'],
    ['real_staff', 'Real staff added, with job details, certificates and emergency contacts'],
    ['real_pay', 'Pay rates, wage grid and PC/PM salaries entered and approved'],
    ['clinical_lead', 'Clinical lead chosen (Admin → Duty roles)'],
  ]],
  ['Final testing (on the test portal)', [
    ['test_policies', 'Policy signing, witness record, lock and full-file download tried'],
    ['test_offer', 'Adding a person with the Job box filled in, and signing the offer letter, tried'],
    ['test_forms', 'House requirements page and a few forms tried'],
    ['test_phone', 'Clock in / out, daily notes (also with Wi-Fi off) and medications tried on a phone'],
    ['test_jobs', 'Applying for a job from a phone tried, end to end'],
    ['test_payroll', 'Payroll export file downloaded and checked with the payroll provider'],
  ]],
];
export const GOLIVE_KEYS = GOLIVE_GROUPS.flatMap(([, items]) => items.map(([k]) => k));
