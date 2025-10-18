-- AlterTable
ALTER TABLE `orders` ADD COLUMN `assignedShipperId` INTEGER NULL,
    ADD COLUMN `shipperNameCache` VARCHAR(255) NULL,
    ADD COLUMN `shipperPhoneCache` VARCHAR(50) NULL;

-- CreateIndex
CREATE INDEX `orders_assignedShipperId_idx` ON `orders`(`assignedShipperId`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_assignedShipperId_fkey` FOREIGN KEY (`assignedShipperId`) REFERENCES `Staff`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
