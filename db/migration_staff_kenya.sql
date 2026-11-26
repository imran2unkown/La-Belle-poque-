USE luxury_restaurant;

-- =========================================================
-- STAFF ACCOUNTS
-- Roles: waiter, cashier, kitchen, delivery, manager
-- =========================================================
CREATE TABLE IF NOT EXISTS staff (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(120) NOT NULL,
  role           ENUM('waiter','cashier','kitchen','delivery','manager') NOT NULL,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login     TIMESTAMP NULL,
  INDEX idx_staff_email (email),
  INDEX idx_staff_role (role)
) ENGINE=InnoDB;

-- =========================================================
-- ORDER STATUS HISTORY
-- =========================================================
CREATE TABLE IF NOT EXISTS order_status_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  status      ENUM('pending','confirmed','preparing','ready','out_for_delivery','delivered','completed','cancelled') NOT NULL,
  changed_by  VARCHAR(120) NULL,
  note        VARCHAR(255) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_osh_order (order_id),
  INDEX idx_osh_created (created_at)
) ENGINE=InnoDB;

-- =========================================================
-- ORDERS: add staff assignment columns
-- (Safe to run even if already present — you can ignore
--  "Duplicate column" errors)
-- =========================================================
ALTER TABLE orders
  ADD COLUMN assigned_delivery_staff_id INT UNSIGNED NULL,
  ADD COLUMN assigned_front_desk_id    INT UNSIGNED NULL,
  ADD COLUMN delivered_at              TIMESTAMP NULL,
  ADD CONSTRAINT fk_order_delivery FOREIGN KEY (assigned_delivery_staff_id)
    REFERENCES staff(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_order_frontdesk FOREIGN KEY (assigned_front_desk_id)
    REFERENCES staff(id) ON DELETE SET NULL;

-- =========================================================
-- SEED SAMPLE STAFF (password auto-set on server boot)
-- =========================================================
INSERT INTO staff (email, password_hash, full_name, role) VALUES
('waiter1@labelleepoque.ke',    '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED', 'Grace Wanjiru',  'waiter'),
('cashier1@labelleepoque.ke',   '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED', 'Brian Otieno',   'cashier'),
('kitchen1@labelleepoque.ke',   '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED', 'Chef Kamau',     'kitchen'),
('delivery1@labelleepoque.ke',  '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED', 'Kevin Mwangi',   'delivery'),
('manager@labelleepoque.ke',    '$2b$10$PLACEHOLDER_HASH_WILL_BE_REPLACED', 'Amina Hassan',   'manager')
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);