-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "defaultQuantity" TEXT NOT NULL DEFAULT 'zero',
    "defaultTemplateId" TEXT,
    "offsetXmm" REAL NOT NULL DEFAULT 0,
    "offsetYmm" REAL NOT NULL DEFAULT 0,
    "rotate90" BOOLEAN NOT NULL DEFAULT false,
    "printerDpi" INTEGER NOT NULL DEFAULT 203,
    "currencySymbol" TEXT NOT NULL DEFAULT 'auto',
    "printMethod" TEXT NOT NULL DEFAULT 'pdf',
    "barcodeSymbology" TEXT NOT NULL DEFAULT 'ean13',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ShopSettings" ("barcodeSymbology", "defaultQuantity", "defaultTemplateId", "offsetXmm", "offsetYmm", "printMethod", "shop", "updatedAt") SELECT "barcodeSymbology", "defaultQuantity", "defaultTemplateId", "offsetXmm", "offsetYmm", "printMethod", "shop", "updatedAt" FROM "ShopSettings";
DROP TABLE "ShopSettings";
ALTER TABLE "new_ShopSettings" RENAME TO "ShopSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
