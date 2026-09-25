BEGIN;
-- CreateEnum
CREATE TYPE "medicine_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "barcode_type" AS ENUM ('EAN13', 'EAN8', 'UPC', 'GTIN', 'QR', 'OTHER');

-- CreateEnum
CREATE TYPE "medicine_image_type" AS ENUM ('FRONT', 'BACK', 'SIDE', 'PACKAGE', 'OTHER');

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "country" VARCHAR(100),
    "website" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "brand_name" VARCHAR(255),
    "generic_name" VARCHAR(255),
    "strength" VARCHAR(100),
    "dosage_form" VARCHAR(100),
    "route" VARCHAR(100),
    "package_size" VARCHAR(100),
    "manufacturer_id" UUID,
    "registration_number" VARCHAR(150),
    "status" "medicine_status" NOT NULL DEFAULT 'ACTIVE',
    "country" VARCHAR(100),
    "description" TEXT,
    "source" VARCHAR(150),
    "source_version" VARCHAR(100),
    "source_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_ingredients" (
    "medicine_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "amount" DECIMAL(12,4),
    "unit" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_ingredients_pkey" PRIMARY KEY ("medicine_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "medicine_barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medicine_id" UUID NOT NULL,
    "barcode" VARCHAR(100) NOT NULL,
    "barcode_type" "barcode_type" NOT NULL,
    "country" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medicine_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "image_type" "medicine_image_type" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicine_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manufacturers_normalized_name_idx" ON "manufacturers"("normalized_name");

-- CreateIndex
CREATE INDEX "medicines_normalized_name_idx" ON "medicines"("normalized_name");

-- CreateIndex
CREATE INDEX "medicines_generic_name_idx" ON "medicines"("generic_name");

-- CreateIndex
CREATE INDEX "medicines_status_idx" ON "medicines"("status");

-- CreateIndex
CREATE INDEX "medicines_manufacturer_idx" ON "medicines"("manufacturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "active_ingredients_normalized_name_unique" ON "active_ingredients"("normalized_name");

-- CreateIndex
CREATE INDEX "medicine_ingredients_ingredient_idx" ON "medicine_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_barcodes_barcode_unique" ON "medicine_barcodes"("barcode");

-- CreateIndex
CREATE INDEX "medicine_barcodes_medicine_idx" ON "medicine_barcodes"("medicine_id");

-- CreateIndex
CREATE INDEX "medicine_images_order_idx" ON "medicine_images"("medicine_id", "sort_order");

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medicine_ingredients" ADD CONSTRAINT "medicine_ingredients_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medicine_ingredients" ADD CONSTRAINT "medicine_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "active_ingredients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medicine_barcodes" ADD CONSTRAINT "medicine_barcodes_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medicine_images" ADD CONSTRAINT "medicine_images_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Reject malformed catalog records at the persistence boundary.
ALTER TABLE manufacturers ADD CONSTRAINT manufacturers_names_nonempty CHECK (length(btrim(name)) > 0 AND length(btrim(normalized_name)) > 0);
ALTER TABLE medicines ADD CONSTRAINT medicines_names_nonempty CHECK (length(btrim(name)) > 0 AND length(btrim(normalized_name)) > 0);
ALTER TABLE active_ingredients ADD CONSTRAINT active_ingredients_names_nonempty CHECK (length(btrim(name)) > 0 AND length(btrim(normalized_name)) > 0);
ALTER TABLE medicine_barcodes ADD CONSTRAINT medicine_barcodes_normalized CHECK (barcode ~ '^[!-~]+$');
ALTER TABLE medicine_images ADD CONSTRAINT medicine_images_sort_nonnegative CHECK (sort_order >= 0);
ALTER TABLE medicine_images ADD CONSTRAINT medicine_images_url_https CHECK (url ~ '^https://[^[:space:]]+$');
COMMIT;
