-- AlterTable
ALTER TABLE `products` ADD COLUMN `cpu` VARCHAR(255) NULL,
    ADD COLUMN `featureTags` VARCHAR(255) NULL,
    ADD COLUMN `ramGB` INTEGER NULL,
    ADD COLUMN `screenResolution` VARCHAR(50) NULL,
    ADD COLUMN `screenSizeInch` DOUBLE NULL,
    ADD COLUMN `storageGB` INTEGER NULL,
    ADD COLUMN `storageType` VARCHAR(50) NULL;

-- CreateIndex
CREATE INDEX `products_factory_idx` ON `products`(`factory`);

-- CreateIndex
CREATE INDEX `products_cpu_idx` ON `products`(`cpu`);

-- CreateIndex
CREATE INDEX `products_ramGB_idx` ON `products`(`ramGB`);

-- CreateIndex
CREATE INDEX `products_storageType_storageGB_idx` ON `products`(`storageType`, `storageGB`);

-- CreateIndex
CREATE INDEX `products_screenResolution_idx` ON `products`(`screenResolution`);

-- CreateIndex
CREATE INDEX `products_screenSizeInch_idx` ON `products`(`screenSizeInch`);
