-- Staff-file forms (entries with subject_profile_id) are private: the person, their Program Coordinator and Program Manager,
-- HR, directors and the Administrator. Other staff at the house can no longer read them. HR can now file them.
-- Applied Nov 14, 2026 as migration staff_file_forms_privacy.
alter policy "entries see" on public.entries using (
  (subject_profile_id is null and (app_scope_home('ind'::text, home_id) or ((resident_id is not null) and is_family_of(resident_id) and share_with_family)))
  or (subject_profile_id is not null and (subject_profile_id = auth.uid() or can_manage_person(subject_profile_id)
      or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(subject_profile_id)))));
alter policy "entries add" on public.entries with check (
  created_by = auth.uid() and (
    (subject_profile_id is null and ind_write(home_id))
    or (subject_profile_id is not null and (subject_profile_id = auth.uid() or can_manage_person(subject_profile_id)
        or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(subject_profile_id))))));
