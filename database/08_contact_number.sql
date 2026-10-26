-- =====================================================
-- StockFlow: contact number for drivers and staff
-- Run AFTER 01 to 07. Safe to run more than once.
-- Adds one optional column to users. Old rows keep an empty contact number.
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number varchar(20);

-- Digits only, with an optional + at the start (7 to 15 digits)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_contact_number') THEN
        ALTER TABLE users
            ADD CONSTRAINT chk_users_contact_number
            CHECK (contact_number IS NULL OR contact_number ~ '^\+?[0-9]{7,15}$');
    END IF;
END $$;
