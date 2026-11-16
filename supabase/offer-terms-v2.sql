-- Offer letter terms version 2 (Nov 16 2026): accountability, workplace safety, honesty,
-- removal from duty, just cause, ESA-minimum termination, 3-month probation.
-- Letters made before today keep version 1 wording; new letters get version 2.
alter table offer_letters add column if not exists terms_version int;
update offer_letters set terms_version = 1 where terms_version is null;
alter table offer_letters alter column terms_version set default 2;
alter table offer_letters alter column terms_version set not null;

-- The signature fingerprint now also covers which version of the terms was signed.
create or replace function public.accept_offer(p_id uuid, p_name text, p_ip text default null, p_agent text default null)
 returns text language plpgsql security definer set search_path to 'public' as $function$
declare o offer_letters; me profiles; sig text; h text;
  norm text := lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]+', ' ', 'g'));
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null or o.profile_id <> auth.uid() then raise exception 'This is not your offer letter.'; end if;
  if o.status <> 'Sent' then raise exception 'This offer is %; it can no longer be accepted.', lower(o.status); end if;
  if o.respond_by is not null and o.respond_by < (now() at time zone 'Etc/GMT+7')::date then
    raise exception 'This offer expired on %. Please contact HR.', o.respond_by;
  end if;
  select * into me from profiles where id = auth.uid();
  if trim(norm) <> trim(lower(regexp_replace(me.full_name, '[^A-Za-z]+', ' ', 'g'))) then
    raise exception 'To sign, type your full name exactly as it is on your account: "%".', me.full_name;
  end if;
  select signature_image into sig from onboardings where profile_id = auth.uid();
  h := encode(sha256(convert_to(jsonb_build_object(
         'id', o.id, 'person', me.full_name, 'position', o.position, 'program', o.program, 'type', o.employment_type,
         'wage', o.wage, 'unit', o.wage_unit, 'hours', o.hours, 'start', o.start_date, 'house', o.house,
         'reports_to', o.reports_to, 'extra', o.extra_terms, 'file', o.file_path,
         'issued_by', o.issued_by_name, 'issued_at', o.issued_at, 'terms', o.terms_version)::text, 'UTF8')), 'hex');
  perform set_config('evg.offer_sign', '1', true);
  update offer_letters set status = 'Accepted', accepted_at = now(), signed_name = trim(p_name), signature_image = sig,
    signer_ip = left(p_ip, 64), signer_agent = left(p_agent, 300), doc_hash = h
  where id = p_id;
  update onboarding_items set status = 'Verified', signed_name = trim(p_name), signed_at = now(),
    data = coalesce(data, '{}'::jsonb) || jsonb_build_object('offer_id', p_id, 'doc_hash', h)
  where profile_id = auth.uid() and item_key = 'offer';
  update staff_details set position = coalesce(position, o.position),
    employment_type = coalesce(employment_type, case when o.employment_type in ('Full-time','Part-time','Casual') then o.employment_type end),
    hire_date = coalesce(hire_date, o.start_date)
  where profile_id = auth.uid();
  perform notify(o.issued_by, me.full_name || ' accepted the offer', o.position || ' — signed ' || to_char(now() at time zone 'Etc/GMT+7', 'Mon DD, YYYY HH24:MI'),
    '/offer/' || p_id, 'offer-acc:' || p_id);
  return h;
end $function$;

-- Probation is 3 months: reviews at 30, 60 and 80 days; the 80-day review is the final one (decided before the 3-month mark).
-- (People already booked on 30/90/120 keep their schedule; their last review stays the final one.)
create or replace function public.book_probation_reviews()
 returns trigger language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $function$
begin
  insert into probation_reviews (staff_id, review_day, due_date)
  select new.staff_id, d, new.hire_date + d from unnest(array[30,60,80]) d
  on conflict do nothing;
  return new;
end $function$;

create or replace function public.check_probation_review()
 returns trigger language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare final_day int;
begin
  if new.completed_on is not null and (tg_op = 'INSERT' or old.completed_on is null) then
    if new.rating is null then raise exception 'Choose a rating before completing the review.'; end if;
    select max(review_day) into final_day from probation_reviews where staff_id = new.staff_id;
    if new.review_day >= 80 and new.review_day = final_day then
      if app_level() < 3 then raise exception 'The final probation review is completed by a Program Manager or above.'; end if;
      if new.final_decision is null then raise exception 'Final review needs a decision: Confirm full-time, Extend probation, or End employment.'; end if;
      if new.final_decision = 'Confirm full-time' then
        update staff_probation set status = 'Confirmed full-time', confirmed_on = new.completed_on, confirmed_by = auth.uid()
          where staff_id = new.staff_id;
        insert into staff_details (profile_id, employment_type) values (new.staff_id, 'Full-time')
          on conflict (profile_id) do update set employment_type = 'Full-time', updated_at = now();
      elsif new.final_decision = 'Extend probation' then
        update staff_probation set status = 'Extended' where staff_id = new.staff_id;
        insert into probation_reviews (staff_id, review_day, due_date)
          values (new.staff_id, new.review_day + 30, new.completed_on + 30) on conflict do nothing;
      else
        update staff_probation set status = 'Ended' where staff_id = new.staff_id;
      end if;
    elsif new.final_decision is not null then
      raise exception 'Only the final (80-day) review has a decision.';
    end if;
  end if;
  return new;
end $function$;
