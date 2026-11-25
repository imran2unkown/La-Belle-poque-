-- =========================================================
-- LUXURY RESTAURANT DATABASE SCHEMA
-- MySQL 8.0+
-- =========================================================

CREATE DATABASE IF NOT EXISTS luxury_restaurant
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE luxury_restaurant;

-- ---------- ADMIN USERS ----------
CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login    TIMESTAMP NULL,
  INDEX idx_admin_email (email)
) ENGINE=InnoDB;

-- ---------- CUSTOMERS ----------
CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(30),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_customer_email (email)
) ENGINE=InnoDB;

-- ---------- MENU CATEGORIES ----------
CREATE TABLE IF NOT EXISTS categories (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB;

-- ---------- MENU ITEMS ----------
CREATE TABLE IF NOT EXISTS menu_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id   INT UNSIGNED NOT NULL,
  name          VARCHAR(150) NOT NULL,
  description   TEXT,
  price         DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  image_url     VARCHAR(500),
  dietary_tags  SET('vegan','vegetarian','gluten_free','nut_free','spicy','dairy_free'),
  is_available  BOOLEAN DEFAULT TRUE,
  prep_minutes  INT DEFAULT 15,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_category FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE RESTRICT,
  INDEX idx_item_category (category_id),
  INDEX idx_item_available (is_available)
) ENGINE=InnoDB;

-- ---------- OPENING HOURS ----------
CREATE TABLE IF NOT EXISTS opening_hours (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  day_of_week TINYINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_closed   BOOLEAN DEFAULT FALSE,
  UNIQUE KEY uq_day (day_of_week)
) ENGINE=InnoDB;

-- ---------- RESERVATIONS ----------
CREATE TABLE IF NOT EXISTS reservations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT UNSIGNED NULL,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(30) NOT NULL,
  party_size      TINYINT UNSIGNED NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  status          ENUM('pending','confirmed','cancelled','seated','completed')
                  DEFAULT 'confirmed',
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL,
  -- prevent double-booking same slot for same table configuration
  UNIQUE KEY uq_slot (reservation_date, reservation_time, party_size),
  INDEX idx_res_date (reservation_date),
  INDEX idx_res_status (status)
) ENGINE=InnoDB;

-- ---------- ORDERS ----------
CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number   VARCHAR(24) NOT NULL UNIQUE,
  customer_id    INT UNSIGNED NULL,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(30) NOT NULL,
  fulfillment    ENUM('pickup','delivery') NOT NULL,
  address        VARCHAR(300) NULL,
  subtotal       DECIMAL(10,2) NOT NULL,
  tax            DECIMAL(10,2) NOT NULL,
  delivery_fee   DECIMAL(10,2) DEFAULT 0.00,
  total          DECIMAL(10,2) NOT NULL,
  status         ENUM('pending','preparing','ready','out_for_delivery','completed','cancelled')
                 DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id)
    REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_order_status (status),
  INDEX idx_order_created (created_at)
) ENGINE=InnoDB;

-- ---------- ORDER ITEMS ----------
CREATE TABLE IF NOT EXISTS order_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id      INT UNSIGNED NOT NULL,
  menu_item_id  INT UNSIGNED NOT NULL,
  item_name     VARCHAR(150) NOT NULL,   -- snapshot
  unit_price    DECIMAL(10,2) NOT NULL,
  quantity      INT UNSIGNED NOT NULL CHECK (quantity > 0),
  customizations JSON NULL,
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id)
    REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu FOREIGN KEY (menu_item_id)
    REFERENCES menu_items(id) ON DELETE RESTRICT,
  INDEX idx_oi_order (order_id)
) ENGINE=InnoDB;

-- ---------- REVIEWS ----------
CREATE TABLE IF NOT EXISTS reviews (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer    VARCHAR(120) NOT NULL,
  rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        TEXT NOT NULL,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;