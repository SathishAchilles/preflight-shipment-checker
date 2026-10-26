-- Saved bookings: every completed chat booking and every uploaded file row, in one shared list.
-- Written and read only through the Vercel function api/bookings.js, which connects as preflight_app.
-- Apply: python3 -I scripts/dbenv.py --apply scripts/db/002_bookings.sql
-- The role's password is set separately (never in this file): see SKILL.md, "Saved bookings".

create table if not exists preflight.bookings (
  id          uuid primary key,
  source      text not null check (source in ('chat', 'file')),
  booking_id  text not null check (length(booking_id) between 1 and 80),
  upload_id   uuid,
  file_name   text check (length(file_name) <= 200),
  original    jsonb not null check (pg_column_size(original) <= 65536),
  overrides   jsonb check (pg_column_size(overrides) <= 65536),
  current     jsonb not null check (pg_column_size(current) <= 65536),
  status      text check (status in ('Red', 'Amber', 'Green')),
  carrier     text check (length(carrier) <= 40),
  cost        numeric(12, 2),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((source = 'file') = (upload_id is not null))
);
create index if not exists bookings_updated on preflight.bookings (updated_at desc);
create index if not exists bookings_upload on preflight.bookings (upload_id) where upload_id is not null;

alter table preflight.bookings enable row level security;

-- Least-privilege login used by the function: this table only, no delete.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'preflight_app') then
    create role preflight_app nologin;
  end if;
end $$;
grant usage on schema preflight to preflight_app;
grant select, insert, update on preflight.bookings to preflight_app;

drop policy if exists bookings_app_all on preflight.bookings;
create policy bookings_app_all on preflight.bookings for all to preflight_app using (true) with check (true);
