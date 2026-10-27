-- Rename the human-readable item code from SKU to ID.
-- Existing SKU-prefixed values become ID-prefixed without changing item_id foreign keys.
BEGIN;

LOCK TABLE public.items IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'items'
          AND column_name = 'sku'
    ) THEN
        RAISE EXCEPTION 'Expected public.items.sku to exist before this migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.items source
        JOIN public.items target
          ON upper(target.sku) = upper(regexp_replace(source.sku, '^SKU-', 'ID-', 'i'))
        WHERE source.sku ~* '^SKU-'
          AND source.item_id <> target.item_id
    ) OR EXISTS (
        SELECT upper(regexp_replace(sku, '^SKU-', 'ID-', 'i'))
        FROM public.items
        WHERE sku ~* '^SKU-'
        GROUP BY 1
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Cannot rename SKU values: the migration would create duplicate item IDs';
    END IF;
END $$;

ALTER TABLE public.items RENAME COLUMN sku TO id;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.items'::regclass
          AND conname = 'items_sku_key'
    ) THEN
        ALTER TABLE public.items RENAME CONSTRAINT items_sku_key TO items_id_key;
    END IF;
END $$;

UPDATE public.items
SET id = regexp_replace(id, '^SKU-', 'ID-', 'i')
WHERE id ~* '^SKU-';

ALTER VIEW public.v_low_stock RENAME COLUMN sku TO id;

COMMIT;
