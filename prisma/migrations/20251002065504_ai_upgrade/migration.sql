/*
  Warnings:

  - A unique constraint covering the columns `[messageId,model]` on the table `AiEmbedding` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[memoryId,model]` on the table `AiEmbedding` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `aichatmessage` ADD COLUMN `completionTokens` INTEGER NULL,
    ADD COLUMN `promptTokens` INTEGER NULL;

-- AlterTable
ALTER TABLE `aiembedding` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `model` VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small';

-- CreateIndex
CREATE INDEX `AiChatMessage_sessionId_id_idx` ON `AiChatMessage`(`sessionId`, `id`);

-- CreateIndex
CREATE UNIQUE INDEX `AiEmbedding_messageId_model_key` ON `AiEmbedding`(`messageId`, `model`);

-- CreateIndex
CREATE UNIQUE INDEX `AiEmbedding_memoryId_model_key` ON `AiEmbedding`(`memoryId`, `model`);
