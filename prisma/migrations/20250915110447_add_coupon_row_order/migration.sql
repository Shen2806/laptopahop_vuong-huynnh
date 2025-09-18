-- AlterTable
ALTER TABLE `orders` ADD COLUMN `couponCode` VARCHAR(191) NULL,
    ADD COLUMN `discountAmount` INTEGER NOT NULL DEFAULT 0;
