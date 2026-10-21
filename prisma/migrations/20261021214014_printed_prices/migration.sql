-- CreateTable
CREATE TABLE "PrintedPrice" (
    "shop" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" TEXT,
    "compareAtPrice" TEXT,
    "printedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("shop", "variantId")
);
