BEGIN;
-- CreateEnum
CREATE TYPE "inventory_unit" AS ENUM ('TABLET', 'CAPSULE', 'ML', 'MG', 'G', 'DOSE', 'SACHET', 'AMPOULE', 'VIAL', 'SUPPOSITORY', 'DROP', 'PATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "inventory_source" AS ENUM ('MANUAL', 'SCAN', 'PRESCRIPTION', 'IMPORT', 'OTHER');

-- CreateTable
CREATE TABLE "medication_inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "inventory_unit" NOT NULL,
    "batch_number" VARCHAR(100),
    "expiry_date" DATE,
    "purchase_date" DATE,
    "storage_location" VARCHAR(150),
    "source" "inventory_source",
    "archived_at" TIMESTAMPTZ(6),
    "low_stock_threshold" DECIMAL(12,3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_patient_idx" ON "medication_inventory"("patient_id");

-- CreateIndex
CREATE INDEX "inventory_patient_expiry_idx" ON "medication_inventory"("patient_id", "expiry_date");

-- CreateIndex
CREATE INDEX "inventory_patient_medicine_idx" ON "medication_inventory"("patient_id", "medicine_id");

-- CreateIndex
CREATE INDEX "inventory_medicine_idx" ON "medication_inventory"("medicine_id");

-- AddForeignKey
ALTER TABLE "medication_inventory" ADD CONSTRAINT "medication_inventory_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_inventory" ADD CONSTRAINT "medication_inventory_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE medication_inventory ADD CONSTRAINT inventory_quantity_range CHECK (quantity BETWEEN 0 AND 999999999.999);
ALTER TABLE medication_inventory ADD CONSTRAINT inventory_threshold_range CHECK (low_stock_threshold IS NULL OR low_stock_threshold BETWEEN 0 AND 999999999.999);
ALTER TABLE medication_inventory ADD CONSTRAINT inventory_expiry_range CHECK (expiry_date IS NULL OR expiry_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
ALTER TABLE medication_inventory ADD CONSTRAINT inventory_purchase_range CHECK (purchase_date IS NULL OR purchase_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
-- PostgreSQL-only partial index; preserved in SQL migrations.
CREATE INDEX inventory_patient_active_idx ON medication_inventory (patient_id) WHERE archived_at IS NULL;
COMMIT;
