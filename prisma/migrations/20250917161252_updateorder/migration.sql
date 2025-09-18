/*
  Warnings:

  - You are about to alter the column `status` on the `orders` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(0))`.
  - You are about to drop the column `googleId` on the `users` table. All the data in the column will be lost.

*/
-- -- DropIndex
-- DROP INDEX `users_googleId_key` ON `users`;

-- -- AlterTable
-- ALTER TABLE `orders` MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'SHIPPING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED') NOT NULL DEFAULT 'PENDING';

-- -- AlterTable
-- ALTER TABLE `users` DROP COLUMN `googleId`;

/* =======================
   Chuẩn hoá cột orders.status
   ======================= */
-- Đưa về UPPER + trim khoảng trắng
UPDATE `orders` SET `status` = UPPER(TRIM(`status`));

-- Map giá trị cũ sang enum mới
UPDATE `orders` SET `status` = 'DELIVERED' WHERE `status` IN ('COMPLETE','COMPLETED','HOAN TAT','HOÀN TẤT');
UPDATE `orders` SET `status` = 'CANCELED'  WHERE `status` IN ('CANCEL','CANCELLED','HUY','HỦY');

-- Giá trị lạ/NULL → PENDING để tránh lỗi khi đổi ENUM
UPDATE `orders`
SET `status` = 'PENDING'
WHERE `status` NOT IN ('PENDING','CONFIRMED','SHIPPING','OUT_FOR_DELIVERY','DELIVERED','CANCELED')
   OR `status` IS NULL OR `status` = '';

/* =======================
   Đổi kiểu sang ENUM
   ======================= */
ALTER TABLE `orders`
  MODIFY `status` ENUM('PENDING','CONFIRMED','SHIPPING','OUT_FOR_DELIVERY','DELIVERED','CANCELED')
  NOT NULL DEFAULT 'PENDING';

/* =======================
   Dọn dẹp users.googleId + index (an toàn)
   ======================= */
-- Drop UNIQUE INDEX nếu tồn tại
SET @idx := (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND INDEX_NAME = 'users_googleId_key'
);
SET @sql := IF(@idx > 0, 'DROP INDEX `users_googleId_key` ON `users`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop COLUMN nếu tồn tại
SET @col := (
  SELECT COUNT(1)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'googleId'
);
SET @sql2 := IF(@col > 0, 'ALTER TABLE `users` DROP COLUMN `googleId`', 'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
