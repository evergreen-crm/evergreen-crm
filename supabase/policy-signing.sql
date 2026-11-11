-- Policies signed inside boxes on the policy PDF (like sign requests). Run once in the Supabase SQL editor.
-- Boxes for each version are placed by an admin; the signed copy is kept in the staff file (paperwork_pdfs).
alter table policy_versions add column if not exists fields jsonb not null default '[]'::jsonb;
alter table policy_acks add column if not exists signature_image text;
alter table policy_acks add column if not exists field_values jsonb;
alter table policy_acks add column if not exists finished_path text;
alter table policy_acks add column if not exists finished_hash text;
