-- AlterTable
ALTER TABLE `orders` ADD COLUMN `receiverDistrictCode` INTEGER NULL,
    ADD COLUMN `receiverProvinceCode` INTEGER NULL,
    ADD COLUMN `receiverStreet` VARCHAR(191) NULL,
    ADD COLUMN `receiverWardCode` INTEGER NULL;

-- CreateTable
CREATE TABLE `Province` (
    `code` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `District` (
    `code` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL,
    `provinceCode` INTEGER NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ward` (
    `code` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NULL,
    `districtCode` INTEGER NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `orders_receiverProvinceCode_idx` ON `orders`(`receiverProvinceCode`);

-- CreateIndex
CREATE INDEX `orders_receiverDistrictCode_idx` ON `orders`(`receiverDistrictCode`);

-- CreateIndex
CREATE INDEX `orders_receiverWardCode_idx` ON `orders`(`receiverWardCode`);

-- AddForeignKey
ALTER TABLE `District` ADD CONSTRAINT `District_provinceCode_fkey` FOREIGN KEY (`provinceCode`) REFERENCES `Province`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ward` ADD CONSTRAINT `Ward_districtCode_fkey` FOREIGN KEY (`districtCode`) REFERENCES `District`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_receiverProvinceCode_fkey` FOREIGN KEY (`receiverProvinceCode`) REFERENCES `Province`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_receiverDistrictCode_fkey` FOREIGN KEY (`receiverDistrictCode`) REFERENCES `District`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_receiverWardCode_fkey` FOREIGN KEY (`receiverWardCode`) REFERENCES `Ward`(`code`) ON DELETE SET NULL ON UPDATE CASCADE;
