-- WOLVOX ilk aktarımında barkod/SKU olarak gelmiş kategori değerlerini,
-- aynı staging kaydındaki güvenli alt grup ile onarır. Yalnız WOLVOX sahipli
-- ürünleri ve aynı kullanıcıya ait bağlantıyı etkiler.

with source_rows as (
  select
    product.id as product_id,
    nullif(trim(staging.brand), '') as source_brand,
    case
      when coalesce(trim(staging.raw_data ->> 'GRUBU'), '') <> ''
        and trim(staging.raw_data ->> 'GRUBU') !~ '^[0-9]{8,14}$'
        and upper(regexp_replace(trim(staging.raw_data ->> 'GRUBU'), '[^[:alnum:]]', '', 'g'))
          not in (
            upper(regexp_replace(coalesce(product.barcode, ''), '[^[:alnum:]]', '', 'g')),
            upper(regexp_replace(coalesce(product.sku, ''), '[^[:alnum:]]', '', 'g'))
          )
        then trim(staging.raw_data ->> 'GRUBU')
      when coalesce(trim(staging.raw_data ->> 'ARA_GRUBU'), '') <> ''
        and trim(staging.raw_data ->> 'ARA_GRUBU') !~ '^[0-9]{8,14}$'
        then trim(staging.raw_data ->> 'ARA_GRUBU')
      when coalesce(trim(staging.raw_data ->> 'ALT_GRUBU'), '') <> ''
        and trim(staging.raw_data ->> 'ALT_GRUBU') !~ '^[0-9]{8,14}$'
        then trim(staging.raw_data ->> 'ALT_GRUBU')
      else null
    end as safe_category
  from public.products as product
  join public.integration_connections as connection
    on connection.provider = 'wolvox'
   and connection.owner_user_id = product.user_id
  join public.wolvox_product_staging as staging
    on staging.connection_id = connection.id
   and staging.external_id = product.external_id
  where product.external_source = 'wolvox'
)
update public.products as product
set
  category = case
    when (
      product.category is null
      or trim(product.category) = ''
      or trim(product.category) ~ '^[0-9]{8,14}$'
      or upper(regexp_replace(product.category, '[^[:alnum:]]', '', 'g'))
        in (
          upper(regexp_replace(coalesce(product.barcode, ''), '[^[:alnum:]]', '', 'g')),
          upper(regexp_replace(coalesce(product.sku, ''), '[^[:alnum:]]', '', 'g'))
        )
    ) then coalesce(source_rows.safe_category, product.category)
    else product.category
  end,
  brand = coalesce(nullif(trim(product.brand), ''), source_rows.source_brand),
  updated_at = now()
from source_rows
where product.id = source_rows.product_id
  and (
    (
      source_rows.source_brand is not null
      and (product.brand is null or trim(product.brand) = '')
    )
    or (
      source_rows.safe_category is not null
      and (
        product.category is null
        or trim(product.category) = ''
        or trim(product.category) ~ '^[0-9]{8,14}$'
        or upper(regexp_replace(product.category, '[^[:alnum:]]', '', 'g'))
          in (
            upper(regexp_replace(coalesce(product.barcode, ''), '[^[:alnum:]]', '', 'g')),
            upper(regexp_replace(coalesce(product.sku, ''), '[^[:alnum:]]', '', 'g'))
          )
      )
    )
  );
