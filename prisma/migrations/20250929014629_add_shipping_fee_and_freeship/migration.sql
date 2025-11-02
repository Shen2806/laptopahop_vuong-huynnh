-- -- AlterTable
-- ALTER TABLE `coupon` ADD COLUMN `freeShip` BOOLEAN NOT NULL DEFAULT false,
--     ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
--     ADD COLUMN `minOrder` INTEGER NULL,
--     ADD COLUMN `shipDiscountCap` INTEGER NULL;

-- -- AlterTable
-- ALTER TABLE `orders` ADD COLUMN `shippingDiscount` INTEGER NOT NULL DEFAULT 0,
--     ADD COLUMN `shippingFee` INTEGER NOT NULL DEFAULT 0;

-- ====== COUPON ======
-- Thêm từng cột nếu bảng coupon tồn tại và cột chưa có
SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon');

-- freeShip
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon' AND COLUMN_NAME = 'freeShip');
SET @sql := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `coupon` ADD COLUMN `freeShip` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- isActive
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon' AND COLUMN_NAME = 'isActive');
SET @sql := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `coupon` ADD COLUMN `isActive` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- minOrder
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon' AND COLUMN_NAME = 'minOrder');
SET @sql := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `coupon` ADD COLUMN `minOrder` INT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- shipDiscountCap
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'coupon' AND COLUMN_NAME = 'shipDiscountCap');
SET @sql := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `coupon` ADD COLUMN `shipDiscountCap` INT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ====== ORDERS ======
SET @otbl := (SELECT COUNT(*) FROM information_schema.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders');

-- shippingDiscount
SET @ocol := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shippingDiscount');
SET @sql := IF(@otbl=1 AND @ocol=0,
  'ALTER TABLE `orders` ADD COLUMN `shippingDiscount` INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- shippingFee
SET @ocol := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shippingFee');
SET @sql := IF(@otbl=1 AND @ocol=0,
  'ALTER TABLE `orders` ADD COLUMN `shippingFee` INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
