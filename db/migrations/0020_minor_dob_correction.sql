-- D11, plan 6.6: a date of birth that makes the athlete a minor sets the profile private,
-- whenever it arrives. 0018 only acted when the date was set for the first time, so
-- correcting an adult's date to a minor's left the profile public.
--   null or adult  -> minor   private (unless the same update chose a visibility)
--   minor          -> adult   visibility left alone
--   minor          -> minor   visibility left alone: they were already a minor, and a
--                             minor who chose to show (D11 sets a default, not a ban) stays
set role eyeq_owner;

create or replace function profiles_minor_private_on_dob() returns trigger
language plpgsql as $$
begin
  if new.dob is distinct from old.dob
     and new.dob is not null and is_minor(new.dob)
     and (old.dob is null or not is_minor(old.dob))
     and new.visibility is not distinct from old.visibility then
    new.visibility := 'private';
  end if;
  return new;
end $$;

reset role;
