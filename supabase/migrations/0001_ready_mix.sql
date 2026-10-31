-- Ready-Mix for Claude Code: plants, mixes, customers, sites, trucks, orders,
-- delivery dockets, test samples and strength results. Plain Postgres; runs on
-- PGlite unchanged. gen_random_uuid() is built into Postgres 13 and later.

create function touch_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table plants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ','AU')),
  audit_ref text,
  test_every_m3 numeric(8,2) not null default 75 check (test_every_m3 > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mixes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  grade_mpa integer not null check (grade_mpa between 5 and 120),
  slump_mm integer not null check (slump_mm between 0 and 300),
  max_aggregate_mm integer not null check (max_aggregate_mm between 4 and 63),
  admixtures text,
  price_per_m3 numeric(10,2) check (price_per_m3 >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  email text,
  phone text,
  credit_hold boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references customers,
  name text not null,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trucks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  rego text,
  capacity_m3 numeric(6,2) not null check (capacity_m3 > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references customers,
  site_id uuid not null references sites,
  plant_id uuid not null references plants,
  mix_id uuid not null references mixes,
  pour_date date not null,
  start_time time,
  volume_m3 numeric(8,2) not null check (volume_m3 > 0),
  element text,
  pump boolean not null default false,
  po_ref text,
  status text not null default 'booked' check (status in ('booked','confirmed','complete','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A docket is the delivery record for one truck load. Volume and batch time are
-- fixed once printed; arrival, discharge, signature and returns are added later.
create table dockets (
  id uuid primary key default gen_random_uuid(),
  docket_no text not null unique,
  order_id uuid not null references orders,
  truck_id uuid not null references trucks,
  batched_at timestamptz not null,
  volume_m3 numeric(6,2) not null check (volume_m3 > 0),
  water_added_l numeric(6,1) not null default 0 check (water_added_l >= 0),
  arrived_at timestamptz,
  discharged_at timestamptz,
  signed_by text,
  returned_m3 numeric(6,2) not null default 0 check (returned_m3 >= 0),
  invoice_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (returned_m3 <= volume_m3),
  check (arrived_at is null or arrived_at >= batched_at),
  check (discharged_at is null or discharged_at >= batched_at)
);

create table samples (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  docket_id uuid not null references dockets,
  sampled_on date not null,
  slump_mm integer check (slump_mm between 0 and 300),
  cylinders integer not null default 3 check (cylinders between 1 and 9),
  lab_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table results (
  id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references samples,
  age_days integer not null check (age_days in (3,7,14,28,56,90)),
  tested_on date not null,
  mpa numeric(6,1) not null check (mpa > 0 and mpa < 200),
  lab_ref text not null check (length(trim(lab_ref)) > 0),
  unique (sample_id, age_days),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['plants','mixes','customers','sites','trucks','orders','dockets','samples','results','notes'] loop
    execute format('create trigger touch before update on %I for each row execute function touch_updated()', t);
  end loop;
end $$;

-- A printed docket keeps its batch time, volume, truck and order.
create function lock_docket() returns trigger language plpgsql as $$
begin
  if new.batched_at <> old.batched_at or new.volume_m3 <> old.volume_m3
     or new.truck_id <> old.truck_id or new.order_id <> old.order_id or new.docket_no <> old.docket_no then
    raise exception 'Docket % is printed: batch time, volume, truck and order cannot change. Issue a credit or a new docket.', old.docket_no;
  end if;
  return new;
end $$;
create trigger docket_locked before update on dockets for each row execute function lock_docket();
create function no_delete() returns trigger language plpgsql as $$
begin raise exception '% records are kept: mark them instead of deleting', tg_table_name; end $$;
create trigger dockets_kept before delete on dockets for each row execute function no_delete();
create trigger results_kept before delete on results for each row execute function no_delete();

-- Delivered volume per order, net of returned concrete.
create view v_order_progress as
select o.id order_id, o.code, o.pour_date, o.status, c.name customer, s.name site, m.code mix,
       o.volume_m3 ordered_m3,
       coalesce(sum(d.volume_m3),0) sent_m3,
       coalesce(sum(d.returned_m3),0) returned_m3,
       coalesce(sum(d.volume_m3 - d.returned_m3),0) placed_m3,
       o.volume_m3 - coalesce(sum(d.volume_m3),0) to_send_m3,
       count(d.id) loads
from orders o
join customers c on c.id = o.customer_id
join sites s on s.id = o.site_id
join mixes m on m.id = o.mix_id
left join dockets d on d.order_id = o.id
group by o.id, c.id, s.id, m.id;

-- The pour schedule: every live order with the loads it will take on the largest active truck.
create view v_pour_schedule as
select p.code, o.pour_date, to_char(o.start_time,'HH24:MI') start_time, o.status, p.customer, p.site, o.element, p.mix,
       pl.code plant, o.pump, p.ordered_m3, p.to_send_m3,
       ceil(greatest(p.to_send_m3,0) / nullif((select max(capacity_m3) from trucks where active),0))::int loads_left,
       c.credit_hold
from v_order_progress p
join orders o on o.id = p.order_id
join plants pl on pl.id = o.plant_id
join customers c on c.id = o.customer_id
where o.status in ('booked','confirmed');

-- Each docket with its timings in minutes.
create view v_dockets as
select d.id docket_id, d.docket_no, d.batched_at::date as day, o.code order_code, c.name customer, s.name site,
       pl.code plant, m.code mix, m.grade_mpa, m.slump_mm, m.max_aggregate_mm, t.code truck,
       d.volume_m3, d.water_added_l, d.returned_m3, d.signed_by, d.invoice_ref,
       to_char(d.batched_at,'HH24:MI') batched, to_char(d.arrived_at,'HH24:MI') arrived, to_char(d.discharged_at,'HH24:MI') discharged,
       round(extract(epoch from (d.arrived_at - d.batched_at))/60)::int travel_min,
       round(extract(epoch from (d.discharged_at - d.arrived_at))/60)::int on_site_min,
       round(extract(epoch from (d.discharged_at - d.batched_at))/60)::int batch_to_discharge_min
from dockets d
join orders o on o.id = d.order_id
join customers c on c.id = o.customer_id
join sites s on s.id = o.site_id
join plants pl on pl.id = o.plant_id
join mixes m on m.id = o.mix_id
join trucks t on t.id = d.truck_id;

-- Production per plant in the last 90 days against the plant's sampling rule.
create view v_test_frequency as
select pl.code plant, pl.test_every_m3, q.produced_m3,
       floor(q.produced_m3 / pl.test_every_m3)::int samples_needed,
       q.samples_taken,
       greatest(floor(q.produced_m3 / pl.test_every_m3)::int - q.samples_taken, 0) samples_short
from plants pl
cross join lateral (
  select coalesce((select sum(d.volume_m3) from dockets d join orders o on o.id = d.order_id
                   where o.plant_id = pl.id and d.batched_at >= current_date - 90),0) produced_m3,
         (select count(*) from samples sa join dockets d on d.id = sa.docket_id join orders o on o.id = d.order_id
           where o.plant_id = pl.id and d.batched_at >= current_date - 90)::int samples_taken
) q;

-- Every sample with its 7 and 28 day results and when they fall due.
create view v_samples as
select sa.id sample_id, sa.code sample, d.docket_no, o.code order_code, c.name customer, s.name site,
       pl.code plant, m.code mix, m.grade_mpa, sa.sampled_on, sa.slump_mm, sa.cylinders, sa.lab_ref,
       sa.sampled_on + 7 due_7, r7.mpa mpa_7, sa.sampled_on + 28 due_28, r28.mpa mpa_28
from samples sa
join dockets d on d.id = sa.docket_id
join orders o on o.id = d.order_id
join customers c on c.id = o.customer_id
join sites s on s.id = o.site_id
join plants pl on pl.id = o.plant_id
join mixes m on m.id = o.mix_id
left join results r7 on r7.sample_id = sa.id and r7.age_days = 7
left join results r28 on r28.sample_id = sa.id and r28.age_days = 28;

create view v_compliance as
select 'DOCKET-INCOMPLETE' rule, d.docket_no record,
       'Missing ' || concat_ws(', ',
         case when d.arrived_at is null then 'arrival time' end,
         case when d.discharged_at is null then 'discharge time' end,
         case when d.signed_by is null then 'site signature' end) issue
from dockets d
where d.batched_at < now() - interval '1 day' and (d.arrived_at is null or d.discharged_at is null or d.signed_by is null)
union all
select 'DISCHARGE-TIME', docket_no, 'Discharge finished ' || batch_to_discharge_min || ' minutes after batching (house limit 90)'
from v_dockets where batch_to_discharge_min > 90
union all
select 'WATER-ADDED', docket_no, water_added_l || ' litres added on site with no signature to accept it'
from v_dockets where water_added_l > 0 and signed_by is null
union all
select 'TEST-FREQUENCY', plant, produced_m3 || ' m3 in 90 days, ' || samples_taken || ' taken, the plant rule needs ' || samples_needed || ' samples'
from v_test_frequency where samples_short > 0
union all
select 'RESULT-OVERDUE', sample, '28 day result due ' || due_28 || ', not recorded'
from v_samples where mpa_28 is null and due_28 < current_date - 2
union all
select 'STRENGTH-BELOW-GRADE', sample, mix || ' specified ' || grade_mpa || ' MPa, 28 day result ' || mpa_28 || ' MPa'
from v_samples where mpa_28 < grade_mpa
union all
select 'PLANT-AUDIT-REF', code, 'No audit or certification reference on the plant'
from plants where audit_ref is null;

create view v_attention as
select 'pour without confirmation' kind, code record, pour_date::text due, customer || ', ' || site detail
from v_pour_schedule where status = 'booked' and pour_date <= current_date + 1
union all
select 'pour booked on credit hold', code, pour_date::text, customer from v_pour_schedule where credit_hold
union all
select 'past pour still open', code, pour_date::text, to_send_m3 || ' m3 not sent' from v_pour_schedule where pour_date < current_date
union all
select '7 day result due', sample, due_7::text, mix || ' for ' || customer from v_samples where mpa_7 is null and due_7 <= current_date and mpa_28 is null
union all
select '28 day result due', sample, due_28::text, mix || ' for ' || customer from v_samples where mpa_28 is null and due_28 <= current_date
union all
select 'docket not invoiced', docket_no, day::text, customer || ', ' || volume_m3 || ' m3' from v_dockets where invoice_ref is null and day < current_date - 7
union all
select 'docket not signed', docket_no, day::text, customer from v_dockets where signed_by is null and day < current_date;
