ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_checkout_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_checkout_id_key
  ON public.orders (payment_checkout_id);
