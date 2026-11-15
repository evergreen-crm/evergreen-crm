-- Offer letters carry the staff member's home address, the house name and address, and the name of the
-- Program Coordinator (or Manager) they report to. Applied Nov 14, 2026 (migrations offer_letter_addresses
-- and offer_letter_addresses_fix). The full auto_offer() is in the live database; this file records the change.
alter table public.staff_details add column if not exists home_address text;
alter table public.offer_letters add column if not exists person_address text;
-- auto_offer(p_profile): house = '<house name>, <house address>'; reports_to = '<role>: <leader name>'
-- (the active leader one level up in the same house); person_address = staff_details.home_address.
-- An automatic letter not yet accepted picks up a changed address or leader name when the job is saved again.
