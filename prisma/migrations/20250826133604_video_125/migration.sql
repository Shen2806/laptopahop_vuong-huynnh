/*
  Warnings:

  - Added the required column `receiverNote` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `orders` ADD COLUMN `receiverNote` VARCHAR(255) NOT NULL;
