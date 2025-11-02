/*
  Warnings:

  - A unique constraint covering the columns `[messageId,model]` on the table `AiEmbedding` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[memoryId,model]` on the table `AiEmbedding` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
-- ALTER TABLE `aichatmessage` ADD COLUMN `completionTokens` INTEGER NULL,
--     ADD COLUMN `promptTokens` INTEGER NULL;

-- -- AlterTable
-- ALTER TABLE `aiembedding` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
--     ADD COLUMN `model` VARCHAR(64) NOT NULL DEFAULT 'text-embedding-3-small';

-- -- CreateIndex
-- CREATE INDEX `AiChatMessage_sessionId_id_idx` ON `AiChatMessage`(`sessionId`, `id`);

-- -- CreateIndex
-- CREATE UNIQUE INDEX `AiEmbedding_messageId_model_key` ON `AiEmbedding`(`messageId`, `model`);

-- -- CreateIndex
-- CREATE UNIQUE INDEX `AiEmbedding_memoryId_model_key` ON `AiEmbedding`(`memoryId`, `model`);
/* ====== AiChatMessage ====== */
/* Hỗ trợ cả aichatmessage (lower) và AiChatMessage (Pascal) */

-- aichatmessage: thêm cột nếu chưa có
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aichatmessage');

-- completionTokens
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aichatmessage' AND COLUMN_NAME='completionTokens');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `aichatmessage` ADD COLUMN `completionTokens` INT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- promptTokens
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aichatmessage' AND COLUMN_NAME='promptTokens');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `aichatmessage` ADD COLUMN `promptTokens` INT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- index (sessionId,id)
SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aichatmessage' AND INDEX_NAME='AiChatMessage_sessionId_id_idx');
SET @sql := IF(@t=1 AND @i=0, 'CREATE INDEX `AiChatMessage_sessionId_id_idx` ON `aichatmessage`(`sessionId`,`id`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- AiChatMessage (PascalCase)
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiChatMessage');

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiChatMessage' AND COLUMN_NAME='completionTokens');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `AiChatMessage` ADD COLUMN `completionTokens` INT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiChatMessage' AND COLUMN_NAME='promptTokens');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `AiChatMessage` ADD COLUMN `promptTokens` INT NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiChatMessage' AND INDEX_NAME='AiChatMessage_sessionId_id_idx');
SET @sql := IF(@t=1 AND @i=0, 'CREATE INDEX `AiChatMessage_sessionId_id_idx` ON `AiChatMessage`(`sessionId`,`id`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;


/* ====== AiEmbedding ====== */
/* Hỗ trợ cả aiembedding (lower) và AiEmbedding (Pascal) */

-- aiembedding
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aiembedding');

-- createdAt
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aiembedding' AND COLUMN_NAME='createdAt');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `aiembedding` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- model
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aiembedding' AND COLUMN_NAME='model');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `aiembedding` ADD COLUMN `model` VARCHAR(64) NOT NULL DEFAULT ''text-embedding-3-small''', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- unique index (messageId, model)
SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aiembedding' AND INDEX_NAME='AiEmbedding_messageId_model_key');
SET @sql := IF(@t=1 AND @i=0, 'CREATE UNIQUE INDEX `AiEmbedding_messageId_model_key` ON `aiembedding`(`messageId`,`model`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- unique index (memoryId, model)
SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='aiembedding' AND INDEX_NAME='AiEmbedding_memoryId_model_key');
SET @sql := IF(@t=1 AND @i=0, 'CREATE UNIQUE INDEX `AiEmbedding_memoryId_model_key` ON `aiembedding`(`memoryId`,`model`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- AiEmbedding (PascalCase)
SET @t := (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiEmbedding');

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiEmbedding' AND COLUMN_NAME='createdAt');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `AiEmbedding` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiEmbedding' AND COLUMN_NAME='model');
SET @sql := IF(@t=1 AND @c=0, 'ALTER TABLE `AiEmbedding` ADD COLUMN `model` VARCHAR(64) NOT NULL DEFAULT ''text-embedding-3-small''', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiEmbedding' AND INDEX_NAME='AiEmbedding_messageId_model_key');
SET @sql := IF(@t=1 AND @i=0, 'CREATE UNIQUE INDEX `AiEmbedding_messageId_model_key` ON `AiEmbedding`(`messageId`,`model`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @i := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='AiEmbedding' AND INDEX_NAME='AiEmbedding_memoryId_model_key');
SET @sql := IF(@t=1 AND @i=0, 'CREATE UNIQUE INDEX `AiEmbedding_memoryId_model_key` ON `AiEmbedding`(`memoryId`,`model`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
