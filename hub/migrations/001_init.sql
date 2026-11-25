create table records (
  id serial primary key,
  kind text not null check (kind in ('client','executor','order','site')),
  name text not null,
  status text not null default 'new',
  priority text not null default '',
  country text not null default '',
  city text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  contact text not null default '',
  summary text not null default '',
  notes text not null default '',
  owner text not null default '',
  next_action text not null default '',
  next_date date,
  qty text not null default '',
  price_note text not null default '',
  link_client_id integer references records(id) on delete set null,
  link_executor_id integer references records(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_kind_idx on records(kind, status);

create table activities (
  id serial primary key,
  record_id integer not null references records(id) on delete cascade,
  type text not null,
  text text not null default '',
  author text not null default '',
  created_at timestamptz not null default now()
);
create index activities_record_idx on activities(record_id, created_at desc);
create index activities_time_idx on activities(created_at desc);
