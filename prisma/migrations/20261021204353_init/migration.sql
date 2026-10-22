-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "defaultQuantity" TEXT NOT NULL DEFAULT 'zero',
    "defaultTemplateId" TEXT,
    "offsetXmm" REAL NOT NULL DEFAULT 0,
    "offsetYmm" REAL NOT NULL DEFAULT 0,
    "printMethod" TEXT NOT NULL DEFAULT 'pdf',
    "barcodeSymbology" TEXT NOT NULL DEFAULT 'ean13',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "widthMm" REAL NOT NULL,
    "heightMm" REAL NOT NULL,
    "shape" TEXT NOT NULL DEFAULT 'rect',
    "layoutJson" TEXT NOT NULL,
    "collectionIds" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "itemsJson" TEXT NOT NULL,
    "labelCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BarcodeCounter" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "nextValue" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "BarcodeChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LabelTemplate_shop_idx" ON "LabelTemplate"("shop");

-- CreateIndex
CREATE INDEX "PrintJob_shop_createdAt_idx" ON "PrintJob"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "BarcodeChange_shop_batchId_idx" ON "BarcodeChange"("shop", "batchId");

-- CreateIndex
CREATE INDEX "BarcodeChange_shop_variantId_idx" ON "BarcodeChange"("shop", "variantId");
