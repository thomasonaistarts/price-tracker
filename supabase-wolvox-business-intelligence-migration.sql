-- Fiyatlaa — WOLVOX işletme zekâsı, ürün kimliği ve e-ticaret feed temeli
-- İdempotenttir. Ürün veya hareket silmez; yalnızca yeni alan ve tablolar ekler.

do $$
declare
  required_relation text;
begin
  foreach required_relation in array array[
    'products',
    'users',
    'integration_connections',
    'integration_sync_runs',
    'price_sync_outbox'
  ] loop
    if to_regclass('public.' || required_relation) is null then
      raise exception
        'missing_base_relation: public.% (run supabase-migration.sql and supabase-wolvox-foundation-migration.sql first)',
        required_relation;
    end if;
  end loop;
end $$;

alter table public.products
  add column if not exists manufacturer_code text,
  add column if not exists product_type text,
  add column if not exists ecommerce_enabled boolean not null default false,
  add column if not exists ecommerce_price numeric(12, 2)
    check (ecommerce_price is null or ecommerce_price > 0),
  add column if not exists ecommerce_commission_rate numeric(5, 2) not null default 0
    check (ecommerce_commission_rate between 0 and 100),
  add column if not exists ecommerce_payment_fee_rate numeric(5, 2) not null default 0
    check (ecommerce_payment_fee_rate between 0 and 100),
  add column if not exists ecommerce_shipping_cost numeric(12, 2) not null default 0
    check (ecommerce_shipping_cost >= 0),
  add column if not exists ecommerce_packaging_cost numeric(12, 2) not null default 0
    check (ecommerce_packaging_cost >= 0),
  add column if not exists ecommerce_target_margin_rate numeric(5, 2) not null default 20
    check (ecommerce_target_margin_rate between 0 and 100),
  add column if not exists ecommerce_price_floor numeric(12, 2)
    check (ecommerce_price_floor is null or ecommerce_price_floor > 0),
  add column if not exists ecommerce_price_ceiling numeric(12, 2)
    check (ecommerce_price_ceiling is null or ecommerce_price_ceiling > 0),
  add column if not exists safety_stock numeric(14, 3) not null default 0
    check (safety_stock >= 0),
  add column if not exists ecommerce_title text,
  add column if not exists ecommerce_description text,
  add column if not exists ecommerce_image_urls text[] not null default '{}',
  add column if not exists ecommerce_updated_at timestamptz;

create table if not exists public.product_identity_profiles (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  proposed_brand text,
  proposed_manufacturer_code text,
  proposed_product_type text,
  confidence text not null check (confidence in ('authoritative', 'corroborated', 'insufficient')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  evidence jsonb not null default '[]',
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id)
);

create or replace function public.apply_manual_product_identity(
  p_product_id uuid,
  p_brand text,
  p_manufacturer_code text,
  p_product_type text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and user_id = v_user_id
    for update
  ) then
    raise exception 'product_not_found';
  end if;

  update public.products
  set
    brand = nullif(trim(p_brand), ''),
    manufacturer_code = nullif(trim(p_manufacturer_code), ''),
    product_type = nullif(trim(p_product_type), ''),
    updated_at = now()
  where id = p_product_id and user_id = v_user_id;

  insert into public.product_identity_profiles (
    product_id, user_id, proposed_brand, proposed_manufacturer_code,
    proposed_product_type, confidence, status, evidence,
    approved_by, approved_at, updated_at
  ) values (
    p_product_id, v_user_id, nullif(trim(p_brand), ''),
    nullif(trim(p_manufacturer_code), ''), nullif(trim(p_product_type), ''),
    'authoritative', 'approved', coalesce(p_evidence, '[]'::jsonb),
    v_user_id, now(), now()
  )
  on conflict (product_id) do update set
    proposed_brand = excluded.proposed_brand,
    proposed_manufacturer_code = excluded.proposed_manufacturer_code,
    proposed_product_type = excluded.proposed_product_type,
    confidence = 'authoritative',
    status = 'approved',
    evidence = excluded.evidence,
    approved_by = v_user_id,
    approved_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'brand', nullif(trim(p_brand), ''),
    'manufacturer_code', nullif(trim(p_manufacturer_code), ''),
    'product_type', nullif(trim(p_product_type), '')
  );
end;
$$;

grant execute on function public.apply_manual_product_identity(uuid, text, text, text, jsonb)
  to authenticated;

-- Source-memory was originally an optional, separate migration. Keep this
-- migration self-contained while preserving any existing memory records.
create table if not exists public.product_source_memory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  source_url text not null,
  source_product_name text,
  status text not null default 'candidate'
    check (status in ('candidate', 'verified')),
  match_confidence text not null
    check (match_confidence in ('exact', 'high', 'medium', 'low')),
  seen_count integer not null default 1 check (seen_count > 0),
  last_price numeric(12, 2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (product_id, platform, source_url)
);

alter table public.product_source_memory enable row level security;

drop policy if exists "product_source_memory_select" on public.product_source_memory;
create policy "product_source_memory_select" on public.product_source_memory
  for select using (user_id = auth.uid() or public.is_admin());

create index if not exists idx_product_source_memory_user_product
  on public.product_source_memory(user_id, product_id, status);

create or replace function public.remember_product_source(
  p_product_id uuid,
  p_platform text,
  p_source_url text,
  p_source_product_name text,
  p_price numeric,
  p_match_confidence text,
  p_force_verified boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id
  from public.products
  where id = p_product_id
    and (user_id = auth.uid() or public.is_admin());

  if owner_id is null then
    raise exception 'product_not_found';
  end if;

  insert into public.product_source_memory (
    product_id, user_id, platform, source_url, source_product_name,
    status, match_confidence, seen_count, last_price
  ) values (
    p_product_id, owner_id, p_platform, p_source_url, p_source_product_name,
    case when p_force_verified then 'verified' else 'candidate' end,
    p_match_confidence, 1, p_price
  )
  on conflict (product_id, platform, source_url) do update
  set
    source_product_name = excluded.source_product_name,
    match_confidence = excluded.match_confidence,
    last_price = excluded.last_price,
    last_seen_at = now(),
    seen_count = product_source_memory.seen_count + 1,
    status = case
      when product_source_memory.status = 'verified' then 'verified'
      when p_force_verified then 'verified'
      when p_match_confidence in ('exact', 'high')
        and product_source_memory.seen_count + 1 >= 2 then 'verified'
      else 'candidate'
    end;
end;
$$;

revoke all on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) from public, anon;
grant execute on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) to authenticated;
grant execute on function public.remember_product_source(
  uuid, text, text, text, numeric, text, boolean
) to service_role;

alter table public.product_source_memory
  add column if not exists external_product_id text,
  add column if not exists matched_barcode text,
  add column if not exists match_method text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists consecutive_failure_count integer not null default 0,
  add column if not exists disabled_at timestamptz;

create table if not exists public.wolvox_inventory_snapshots (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_run_id uuid references public.integration_sync_runs(id) on delete set null,
  external_product_id text not null,
  depot_code text not null default '',
  depot_name text,
  snapshot_at timestamptz not null,
  period_started_at timestamptz,
  quantity_in numeric(16, 3) not null default 0,
  quantity_out numeric(16, 3) not null default 0,
  quantity_remaining numeric(16, 3) not null default 0,
  quantity_available numeric(16, 3) not null default 0,
  quantity_blocked numeric(16, 3) not null default 0,
  unit_cost numeric(14, 4),
  inventory_value numeric(16, 2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique(connection_id, external_product_id, depot_code, snapshot_at)
);

alter table public.integration_sync_runs
  drop constraint if exists integration_sync_runs_entity_type_check;
alter table public.integration_sync_runs
  add constraint integration_sync_runs_entity_type_check
  check (entity_type in ('catalog', 'inventory', 'prices', 'discovery', 'financial_summary', 'documents', 'current_accounts'));

create table if not exists public.wolvox_daily_financial_summaries (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_run_id uuid references public.integration_sync_runs(id) on delete set null,
  summary_date date not null,
  analysis_time time,
  purchase_total numeric(16, 2) not null default 0,
  purchase_return_total numeric(16, 2) not null default 0,
  net_purchase_total numeric(16, 2) not null default 0,
  sales_total numeric(16, 2) not null default 0,
  sales_return_total numeric(16, 2) not null default 0,
  net_sales_total numeric(16, 2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique(connection_id, summary_date, analysis_time)
);

create table if not exists public.wolvox_current_accounts (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  external_id text not null,
  account_code text,
  account_type text,
  group_name text,
  is_supplier boolean not null default false,
  is_active boolean not null default true,
  source_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(connection_id, external_id)
);

create table if not exists public.wolvox_documents (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_run_id uuid references public.integration_sync_runs(id) on delete set null,
  external_id text not null,
  document_type text not null check (document_type in ('sale', 'purchase', 'sale_return', 'purchase_return')),
  document_number text,
  document_at timestamptz not null,
  current_account_id uuid references public.wolvox_current_accounts(id) on delete set null,
  depot_code text,
  branch_code text,
  channel text not null default 'unknown' check (channel in ('store', 'web', 'marketplace', 'unknown')),
  gross_total numeric(16, 2) not null default 0,
  net_total numeric(16, 2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_id, document_type)
);

create table if not exists public.wolvox_document_lines (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.wolvox_documents(id) on delete cascade,
  external_line_id text not null,
  external_product_id text not null,
  quantity numeric(16, 3) not null,
  unit_price numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4),
  discount_total numeric(14, 2) not null default 0,
  tax_rate numeric(5, 2),
  net_total numeric(16, 2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique(document_id, external_line_id)
);

create table if not exists public.wolvox_channel_mappings (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  source_field text not null check (source_field in ('depot_code', 'branch_code', 'document_series', 'current_account_group')),
  source_value text not null,
  channel text not null check (channel in ('store', 'web', 'marketplace')),
  marketplace_name text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, source_field, source_value)
);

create table if not exists public.wolvox_data_quality_issues (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  sync_run_id uuid references public.integration_sync_runs(id) on delete cascade,
  entity_type text not null,
  external_id text,
  issue_code text not null,
  severity text not null check (severity in ('info', 'warning', 'blocking')),
  details jsonb not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.price_proposals (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  target text not null check (target in ('store', 'ecommerce')),
  current_price numeric(12, 2) not null check (current_price > 0),
  proposed_price numeric(12, 2) not null check (proposed_price > 0),
  change_percent numeric(9, 2) not null,
  requires_extra_approval boolean not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'failed', 'cancelled')),
  reason text not null,
  calculation_snapshot jsonb not null,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.apply_ecommerce_pricing_configuration(
  p_product_id uuid,
  p_ecommerce_enabled boolean,
  p_ecommerce_price numeric,
  p_commission_rate numeric,
  p_payment_fee_rate numeric,
  p_shipping_cost numeric,
  p_packaging_cost numeric,
  p_target_margin_rate numeric,
  p_price_floor numeric,
  p_price_ceiling numeric,
  p_safety_stock numeric,
  p_confirm_large_change boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_current_price numeric;
  v_change_percent numeric := 0;
  v_requires_extra_approval boolean := false;
  v_proposal_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_commission_rate < 0 or p_payment_fee_rate < 0
    or p_shipping_cost < 0 or p_packaging_cost < 0
    or p_target_margin_rate < 0 or p_safety_stock < 0
    or p_commission_rate + p_payment_fee_rate + p_target_margin_rate >= 100 then
    raise exception 'invalid_ecommerce_pricing_configuration';
  end if;
  if p_ecommerce_enabled and p_ecommerce_price is null then
    raise exception 'ecommerce_price_required';
  end if;
  if p_ecommerce_price is not null and p_ecommerce_price <= 0 then
    raise exception 'invalid_ecommerce_price';
  end if;
  if (p_price_floor is not null and p_price_floor <= 0)
    or (p_price_ceiling is not null and p_price_ceiling <= 0)
    or (
      p_price_floor is not null and p_price_ceiling is not null
      and p_price_ceiling < p_price_floor
    ) then
    raise exception 'invalid_ecommerce_price_limits';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_user_id
  for update;
  if not found then
    raise exception 'product_not_found';
  end if;

  v_current_price := coalesce(v_product.ecommerce_price, v_product.our_price);
  if p_ecommerce_price is not null and v_current_price > 0 then
    v_change_percent := round(
      ((p_ecommerce_price - v_current_price) / v_current_price) * 100,
      2
    );
    v_requires_extra_approval := abs(v_change_percent) > 10;
  end if;
  if v_requires_extra_approval and not p_confirm_large_change then
    raise exception 'large_price_change_requires_confirmation';
  end if;

  update public.products
  set
    ecommerce_enabled = p_ecommerce_enabled,
    ecommerce_price = p_ecommerce_price,
    ecommerce_commission_rate = p_commission_rate,
    ecommerce_payment_fee_rate = p_payment_fee_rate,
    ecommerce_shipping_cost = p_shipping_cost,
    ecommerce_packaging_cost = p_packaging_cost,
    ecommerce_target_margin_rate = p_target_margin_rate,
    ecommerce_price_floor = p_price_floor,
    ecommerce_price_ceiling = p_price_ceiling,
    safety_stock = p_safety_stock,
    ecommerce_updated_at = now(),
    updated_at = now()
  where id = p_product_id and user_id = v_user_id;

  if p_ecommerce_price is not null and v_current_price > 0
    and p_ecommerce_price is distinct from v_current_price then
    insert into public.price_proposals (
      product_id, user_id, target, current_price, proposed_price,
      change_percent, requires_extra_approval, status, reason,
      calculation_snapshot, approved_by, approved_at, applied_at
    ) values (
      p_product_id, v_user_id, 'ecommerce', v_current_price,
      p_ecommerce_price, v_change_percent, v_requires_extra_approval,
      'applied', 'E-ticaret kanal fiyatı ve maliyet ayarları güncellendi',
      jsonb_build_object(
        'commission_rate', p_commission_rate,
        'payment_fee_rate', p_payment_fee_rate,
        'shipping_cost', p_shipping_cost,
        'packaging_cost', p_packaging_cost,
        'target_margin_rate', p_target_margin_rate,
        'price_floor', p_price_floor,
        'price_ceiling', p_price_ceiling,
        'safety_stock', p_safety_stock
      ),
      v_user_id, now(), now()
    )
    returning id into v_proposal_id;
  end if;

  return jsonb_build_object(
    'ecommerce_enabled', p_ecommerce_enabled,
    'ecommerce_price', p_ecommerce_price,
    'ecommerce_commission_rate', p_commission_rate,
    'ecommerce_payment_fee_rate', p_payment_fee_rate,
    'ecommerce_shipping_cost', p_shipping_cost,
    'ecommerce_packaging_cost', p_packaging_cost,
    'ecommerce_target_margin_rate', p_target_margin_rate,
    'ecommerce_price_floor', p_price_floor,
    'ecommerce_price_ceiling', p_price_ceiling,
    'safety_stock', p_safety_stock,
    'change_percent', v_change_percent,
    'requires_extra_approval', v_requires_extra_approval,
    'price_proposal_id', v_proposal_id
  );
end;
$$;

grant execute on function public.apply_ecommerce_pricing_configuration(
  uuid, boolean, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, boolean
) to authenticated;

alter table public.price_sync_outbox
  add column if not exists expected_old_price numeric(12, 2)
    check (expected_old_price is null or expected_old_price > 0),
  add column if not exists price_proposal_id uuid references public.price_proposals(id) on delete set null,
  add column if not exists requires_extra_approval boolean not null default false,
  add column if not exists approved_by uuid references public.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists readback_price numeric(12, 2),
  add column if not exists verified_at timestamptz,
  add column if not exists rollback_price numeric(12, 2);

alter table public.product_identity_profiles enable row level security;
alter table public.wolvox_inventory_snapshots enable row level security;
alter table public.wolvox_daily_financial_summaries enable row level security;
alter table public.wolvox_current_accounts enable row level security;
alter table public.wolvox_documents enable row level security;
alter table public.wolvox_document_lines enable row level security;
alter table public.wolvox_channel_mappings enable row level security;
alter table public.wolvox_data_quality_issues enable row level security;
alter table public.price_proposals enable row level security;

create index if not exists idx_identity_profiles_user_status on public.product_identity_profiles(user_id, status);
create index if not exists idx_inventory_snapshots_product_time on public.wolvox_inventory_snapshots(connection_id, external_product_id, snapshot_at desc);
create index if not exists idx_inventory_snapshots_depot_time on public.wolvox_inventory_snapshots(connection_id, depot_code, snapshot_at desc);
create index if not exists idx_financial_summary_date on public.wolvox_daily_financial_summaries(connection_id, summary_date desc);
create index if not exists idx_wolvox_documents_time_channel on public.wolvox_documents(connection_id, document_at desc, channel);
create index if not exists idx_wolvox_document_lines_product on public.wolvox_document_lines(external_product_id, document_id);
create index if not exists idx_wolvox_quality_open on public.wolvox_data_quality_issues(connection_id, status, severity);
create index if not exists idx_price_proposals_user_status on public.price_proposals(user_id, status, created_at desc);

drop policy if exists "product_identity_profiles_owner_select" on public.product_identity_profiles;
create policy "product_identity_profiles_owner_select" on public.product_identity_profiles
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "product_identity_profiles_admin_all" on public.product_identity_profiles;
create policy "product_identity_profiles_admin_all" on public.product_identity_profiles
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "price_proposals_owner_select" on public.price_proposals;
create policy "price_proposals_owner_select" on public.price_proposals
  for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "price_proposals_admin_all" on public.price_proposals;
create policy "price_proposals_admin_all" on public.price_proposals
  for all using (public.is_admin()) with check (public.is_admin());

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'wolvox_inventory_snapshots',
    'wolvox_daily_financial_summaries',
    'wolvox_current_accounts',
    'wolvox_documents',
    'wolvox_channel_mappings',
    'wolvox_data_quality_issues'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_owner_select', table_name);
    execute format(
      'create policy %I on public.%I for select using (
        exists (
          select 1 from public.integration_connections c
          where c.id = connection_id and (c.owner_user_id = auth.uid() or public.is_admin())
        )
      )',
      table_name || '_owner_select',
      table_name
    );
    execute format('drop policy if exists %I on public.%I', table_name || '_admin_all', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      table_name || '_admin_all',
      table_name
    );
  end loop;
end $$;

drop policy if exists "wolvox_document_lines_owner_select" on public.wolvox_document_lines;
create policy "wolvox_document_lines_owner_select" on public.wolvox_document_lines
  for select using (
    exists (
      select 1
      from public.wolvox_documents d
      join public.integration_connections c on c.id = d.connection_id
      where d.id = document_id
        and (c.owner_user_id = auth.uid() or public.is_admin())
    )
  );
drop policy if exists "wolvox_document_lines_admin_all" on public.wolvox_document_lines;
create policy "wolvox_document_lines_admin_all" on public.wolvox_document_lines
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_product_identity_profiles_updated_at on public.product_identity_profiles;
create trigger trg_product_identity_profiles_updated_at
  before update on public.product_identity_profiles
  for each row execute function update_updated_at();
drop trigger if exists trg_wolvox_documents_updated_at on public.wolvox_documents;
create trigger trg_wolvox_documents_updated_at
  before update on public.wolvox_documents
  for each row execute function update_updated_at();
drop trigger if exists trg_wolvox_channel_mappings_updated_at on public.wolvox_channel_mappings;
create trigger trg_wolvox_channel_mappings_updated_at
  before update on public.wolvox_channel_mappings
  for each row execute function update_updated_at();
