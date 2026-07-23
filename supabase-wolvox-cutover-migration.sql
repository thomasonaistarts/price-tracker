-- Fiyatlaa — WOLVOX canlı katalog geçişi
-- Bu dosyayı çalıştırmak tek başına ürün silmez.
-- Silme + ekleme yalnızca execute_wolvox_catalog_cutover RPC'si,
-- doğru sayımlar ve açık onay koduyla çağrıldığında tek transaction içinde yapılır.

alter table public.products
  add column if not exists external_source text,
  add column if not exists external_id text,
  add column if not exists barcode text,
  add column if not exists stock_quantity numeric(14, 3),
  add column if not exists stock_unit text,
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists market_tracking_override boolean;

create unique index if not exists idx_products_external_identity
  on public.products(user_id, external_source, external_id)
  where external_source is not null and external_id is not null;

create index if not exists idx_products_barcode
  on public.products(user_id, barcode)
  where barcode is not null;

create index if not exists idx_products_market_tracking_queue
  on public.products(is_active, market_tracking_override, our_price, stock_quantity, last_attempted_at, last_analyzed_at);

create or replace function public.execute_wolvox_catalog_cutover(
  p_connection_id uuid,
  p_sync_run_id uuid,
  p_expected_delete_count integer,
  p_expected_insert_count integer,
  p_confirmation_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_sync_status text;
  v_received_count integer;
  v_run_details jsonb;
  v_archive_batch_id uuid;
  v_staging_count integer;
  v_candidate_count integer;
  v_unique_sku_count integer;
  v_unresolved_invalid integer;
  v_unresolved_conflict integer;
  v_live_count integer;
  v_deleted_count integer;
  v_inserted_count integer;
  v_excluded_count integer;
  v_cleared_barcode_count integer;
  v_cutover_run_id uuid;
  v_expected_code text;
  v_now timestamptz := now();
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select owner_user_id
    into v_owner_user_id
  from public.integration_connections
  where id = p_connection_id
    and provider = 'wolvox';

  if v_owner_user_id is null then
    raise exception 'wolvox_connection_not_found';
  end if;

  select status, received_count, details
    into v_sync_status, v_received_count, v_run_details
  from public.integration_sync_runs
  where id = p_sync_run_id
    and connection_id = p_connection_id
    and entity_type = 'catalog';

  if v_sync_status is distinct from 'succeeded' then
    raise exception 'successful_catalog_sync_required';
  end if;

  select id
    into v_archive_batch_id
  from public.data_archive_batches
  where status = 'verified'
    and source_counts = archive_counts
  order by verified_at desc nulls last, created_at desc
  limit 1;

  if v_archive_batch_id is null then
    raise exception 'verified_archive_required';
  end if;

  select count(*)
    into v_staging_count
  from public.wolvox_product_staging
  where connection_id = p_connection_id
    and sync_run_id = p_sync_run_id;

  if v_staging_count <> v_received_count then
    raise exception 'staging_count_mismatch:%/%', v_staging_count, v_received_count;
  end if;

  select count(*)
    into v_unresolved_invalid
  from public.wolvox_product_staging s
  where s.connection_id = p_connection_id
    and s.sync_run_id = p_sync_run_id
    and cardinality(s.validation_errors) > 0
    and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') <> 'exclude';

  if v_unresolved_invalid > 0 then
    raise exception 'unresolved_invalid_records:%', v_unresolved_invalid;
  end if;

  with duplicate_keys as (
    select upper(regexp_replace(
      coalesce(nullif(btrim(barcode), ''), nullif(btrim(sku), '')),
      '[^[:alnum:]]', '', 'g'
    )) as product_key
    from public.wolvox_product_staging
    where connection_id = p_connection_id
      and sync_run_id = p_sync_run_id
    group by 1
    having count(*) > 1
  )
  select count(*)
    into v_unresolved_conflict
  from public.wolvox_product_staging s
  join duplicate_keys d
    on d.product_key = upper(regexp_replace(
      coalesce(nullif(btrim(s.barcode), ''), nullif(btrim(s.sku), '')),
      '[^[:alnum:]]', '', 'g'
    ))
  where s.connection_id = p_connection_id
    and s.sync_run_id = p_sync_run_id
    and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') not in ('exclude', 'use_sku');

  if v_unresolved_conflict > 0 then
    raise exception 'unresolved_conflict_records:%', v_unresolved_conflict;
  end if;

  with candidates as (
    select
      s.*,
      coalesce(nullif(btrim(s.sku), ''), nullif(btrim(s.barcode), '')) as destination_sku
    from public.wolvox_product_staging s
    where s.connection_id = p_connection_id
      and s.sync_run_id = p_sync_run_id
      and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') <> 'exclude'
  )
  select
    count(*),
    count(distinct upper(regexp_replace(destination_sku, '[^[:alnum:]]', '', 'g')))
  into v_candidate_count, v_unique_sku_count
  from candidates;

  if v_candidate_count <> p_expected_insert_count then
    raise exception 'candidate_count_mismatch:%/%', v_candidate_count, p_expected_insert_count;
  end if;

  if v_unique_sku_count <> v_candidate_count then
    raise exception 'destination_sku_conflict:%/%', v_unique_sku_count, v_candidate_count;
  end if;

  select count(*) into v_live_count from public.products;
  if v_live_count <> p_expected_delete_count then
    raise exception 'live_product_count_changed:%/%', v_live_count, p_expected_delete_count;
  end if;

  v_expected_code := 'WOLVOX-' || v_candidate_count::text || '-' || v_live_count::text;
  if p_confirmation_code is distinct from v_expected_code then
    raise exception 'confirmation_code_mismatch';
  end if;

  select count(*)
    into v_excluded_count
  from public.wolvox_product_staging s
  where s.connection_id = p_connection_id
    and s.sync_run_id = p_sync_run_id
    and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') = 'exclude';

  with included_barcodes as (
    select barcode, count(*) as row_count
    from public.wolvox_product_staging s
    where s.connection_id = p_connection_id
      and s.sync_run_id = p_sync_run_id
      and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') <> 'exclude'
      and nullif(btrim(barcode), '') is not null
    group by barcode
  )
  select coalesce(sum(row_count) filter (where row_count > 1), 0)::integer
    into v_cleared_barcode_count
  from included_barcodes;

  delete from public.products;
  get diagnostics v_deleted_count = row_count;

  with candidates as (
    select
      s.*,
      coalesce(nullif(btrim(s.sku), ''), nullif(btrim(s.barcode), '')) as destination_sku,
      count(*) over (partition by nullif(btrim(s.barcode), '')) as included_barcode_count
    from public.wolvox_product_staging s
    where s.connection_id = p_connection_id
      and s.sync_run_id = p_sync_run_id
      and coalesce(v_run_details -> 'record_decisions' ->> s.external_id, '') <> 'exclude'
  )
  insert into public.products (
    user_id,
    sku,
    product_name,
    brand,
    category,
    our_price,
    purchase_cost,
    vat_rate,
    currency,
    is_active,
    external_source,
    external_id,
    barcode,
    stock_quantity,
    stock_unit,
    external_updated_at,
    last_synced_at
  )
  select
    v_owner_user_id,
    destination_sku,
    product_name,
    brand,
    category,
    sales_price,
    purchase_cost,
    vat_rate,
    'TRY',
    is_active,
    'wolvox',
    external_id,
    case
      when nullif(btrim(barcode), '') is null then null
      when included_barcode_count > 1 then null
      else barcode
    end,
    stock_quantity,
    unit_name,
    null,
    v_now
  from candidates;
  get diagnostics v_inserted_count = row_count;

  if v_deleted_count <> p_expected_delete_count or v_inserted_count <> p_expected_insert_count then
    raise exception 'cutover_result_mismatch:deleted=% inserted=%', v_deleted_count, v_inserted_count;
  end if;

  update public.integration_connections
  set
    status = 'connected',
    wolvox_version = '26',
    company_code = coalesce(company_code, '001'),
    working_year = coalesce(working_year, 2024),
    last_heartbeat_at = v_now,
    last_error = null,
    updated_at = v_now
  where id = p_connection_id;

  insert into public.integration_sync_runs (
    connection_id,
    direction,
    entity_type,
    status,
    received_count,
    valid_count,
    invalid_count,
    details,
    started_at,
    finished_at
  )
  values (
    p_connection_id,
    'inbound',
    'catalog',
    'succeeded',
    v_staging_count,
    v_inserted_count,
    v_excluded_count,
    jsonb_build_object(
      'operation', 'live_cutover',
      'source_sync_run_id', p_sync_run_id,
      'archive_batch_id', v_archive_batch_id,
      'deleted_product_count', v_deleted_count,
      'inserted_product_count', v_inserted_count,
      'excluded_product_count', v_excluded_count,
      'cleared_barcode_count', v_cleared_barcode_count,
      'confirmation_code', v_expected_code
    ),
    v_now,
    v_now
  )
  returning id into v_cutover_run_id;

  return jsonb_build_object(
    'success', true,
    'cutover_run_id', v_cutover_run_id,
    'source_sync_run_id', p_sync_run_id,
    'archive_batch_id', v_archive_batch_id,
    'deleted_product_count', v_deleted_count,
    'inserted_product_count', v_inserted_count,
    'excluded_product_count', v_excluded_count,
    'cleared_barcode_count', v_cleared_barcode_count,
    'finished_at', v_now
  );
end;
$$;

revoke all on function public.execute_wolvox_catalog_cutover(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.execute_wolvox_catalog_cutover(uuid, uuid, integer, integer, text)
  to service_role;
