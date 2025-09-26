-- CreateTable
CREATE TABLE `AiChatSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `topic` VARCHAR(255) NULL,
    `summary` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AiChatSession_userId_lastUsedAt_idx`(`userId`, `lastUsedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiChatMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `role` ENUM('USER', 'ASSISTANT', 'SYSTEM') NOT NULL,
    `content` TEXT NOT NULL,
    `tokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiMemory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `sessionId` INTEGER NULL,
    `type` VARCHAR(32) NOT NULL,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NOT NULL,
    `score` DOUBLE NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AiMemory_userId_sessionId_type_idx`(`userId`, `sessionId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiEmbedding` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `messageId` INTEGER NULL,
    `memoryId` INTEGER NULL,
    `dim` INTEGER NOT NULL,
    `vector` JSON NOT NULL,

    UNIQUE INDEX `AiEmbedding_messageId_key`(`messageId`),
    INDEX `AiEmbedding_messageId_idx`(`messageId`),
    INDEX `AiEmbedding_memoryId_idx`(`memoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AiChatMessage` ADD CONSTRAINT `AiChatMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AiChatSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiMemory` ADD CONSTRAINT `AiMemory_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AiChatSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiEmbedding` ADD CONSTRAINT `AiEmbedding_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `AiChatMessage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiEmbedding` ADD CONSTRAINT `AiEmbedding_memoryId_fkey` FOREIGN KEY (`memoryId`) REFERENCES `AiMemory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
