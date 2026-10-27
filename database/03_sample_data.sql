-- =====================================================
-- StockFlow: Sample data for testing
-- Run AFTER 01 and 02. Run only ONCE (running twice gives "duplicate key").
-- =====================================================

INSERT INTO warehouses (warehouse_id, name, address, city) VALUES
('11111111-1111-1111-1111-111111111111', 'Cebu Main',    'Mandaue Road', 'Cebu City'),
('22222222-2222-2222-2222-222222222222', 'Davao Branch', 'Bajada',       'Davao City');

-- password_hash here is a placeholder, not a real password hash
INSERT INTO users (user_id, firstname, lastname, email, password_hash, role) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin',  'User', 'admin@test.com',  'test', 'admin'),
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Client', 'User', 'client@test.com', 'test', 'client');

INSERT INTO items (item_id, id, name, unit_price) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'ID-001', 'Test Item', 100);
