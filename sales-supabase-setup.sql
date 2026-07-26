create table if not exists public.sales_state (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.sales_state enable row level security;

drop policy if exists "sales public read" on public.sales_state;
create policy "sales public read"
on public.sales_state for select to anon
using (id = 'main');

drop policy if exists "sales public update" on public.sales_state;
create policy "sales public update"
on public.sales_state for update to anon
using (id = 'main')
with check (id = 'main');

insert into public.sales_state (id, items, revision)
values ('main', '[]'::jsonb, 0)
on conflict (id) do nothing;

