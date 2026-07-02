create extension if not exists pgcrypto;

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  seller_id uuid references public.sellers(id),
  full_name text,
  role text not null check (role in ('admin','seller','operator')) default 'seller',
  created_at timestamptz default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  order_number text not null,
  customer_email text not null,
  customer_name text,
  customer_lastname text,
  dni text,
  address text,
  product text,
  logistic_operator text,
  status text not null check (status in ('pending','in_transit','delivered','issue')) default 'pending',
  source text not null default 'manual',
  tracking_token uuid unique default gen_random_uuid(),
  tracking_url text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (seller_id, order_number)
);

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null,
  detail text,
  created_at timestamptz default now()
);

create table public.customer_confirmations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  dni_last_digits text,
  created_at timestamptz default now()
);

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  recipient text,
  subject text,
  status text,
  provider_response jsonb,
  created_at timestamptz default now()
);

alter table public.sellers enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.tracking_events enable row level security;
alter table public.customer_confirmations enable row level security;
alter table public.email_logs enable row level security;

create or replace function public.current_role() returns text language sql stable as $$
  select role from public.profiles where id = auth.uid();
$$;
create or replace function public.current_seller() returns uuid language sql stable as $$
  select seller_id from public.profiles where id = auth.uid();
$$;

create policy "profiles own or admin" on public.profiles for select using (id = auth.uid() or public.current_role() = 'admin');
create policy "sellers visible" on public.sellers for select using (public.current_role() = 'admin' or id = public.current_seller());
create policy "orders visible" on public.orders for select using (public.current_role() = 'admin' or seller_id = public.current_seller() or tracking_token::text is not null);
create policy "orders insert" on public.orders for insert with check (public.current_role() = 'admin' or seller_id = public.current_seller());
create policy "orders update" on public.orders for update using (public.current_role() = 'admin' or seller_id = public.current_seller());
create policy "tracking select" on public.tracking_events for select using (true);
create policy "tracking insert" on public.tracking_events for insert with check (true);
create policy "confirm insert" on public.customer_confirmations for insert with check (true);
create policy "email logs admin" on public.email_logs for select using (public.current_role() = 'admin');

-- API RPC para crear o actualizar órdenes desde sistemas externos.
create or replace function public.api_upsert_order(
  p_seller_id uuid,
  p_order_number text,
  p_customer_email text,
  p_customer_name text default null,
  p_customer_lastname text default null,
  p_dni text default null,
  p_address text default null,
  p_product text default null,
  p_logistic_operator text default null
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  insert into public.orders(seller_id, order_number, customer_email, customer_name, customer_lastname, dni, address, product, logistic_operator, source)
  values(p_seller_id, p_order_number, p_customer_email, p_customer_name, p_customer_lastname, p_dni, p_address, p_product, p_logistic_operator, 'api')
  on conflict (seller_id, order_number) do update set
    customer_email=excluded.customer_email,
    customer_name=excluded.customer_name,
    customer_lastname=excluded.customer_lastname,
    dni=excluded.dni,
    address=excluded.address,
    product=excluded.product,
    logistic_operator=excluded.logistic_operator,
    updated_at=now()
  returning id into v_id;
  return v_id;
end; $$;
