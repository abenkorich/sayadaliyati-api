BEGIN;
-- CreateEnum
CREATE TYPE "prescription_source" AS ENUM ('SCANNED', 'MANUAL', 'SHARED', 'DIGITAL');

-- CreateEnum
CREATE TYPE "prescription_status" AS ENUM ('DRAFT', 'CONFIRMED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ocr_processing_status" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'REVIEW_REQUIRED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "extraction_source" AS ENUM ('OCR', 'AI', 'USER', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "extraction_confirmation_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID,
    "prescription_date" DATE,
    "valid_until" DATE,
    "source" "prescription_source" NOT NULL,
    "processing_status" "ocr_processing_status",
    "status" "prescription_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_medications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_id" UUID NOT NULL,
    "medicine_id" UUID,
    "extracted_name" VARCHAR(255),
    "dosage" DECIMAL(12,4),
    "dosage_unit" VARCHAR(50),
    "frequency" DECIMAL(12,4),
    "frequency_unit" VARCHAR(50),
    "duration" DECIMAL(12,4),
    "duration_unit" VARCHAR(50),
    "quantity" DECIMAL(12,3),
    "instructions" TEXT,
    "confidence" DECIMAL(5,4),
    "confirmation_status" "extraction_confirmation_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_extracted_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_medication_id" UUID NOT NULL,
    "field_name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "value" JSONB,
    "confidence" DECIMAL(5,4),
    "source" "extraction_source" NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "processing_status" "ocr_processing_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "prescription_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescriptions_patient_status_idx" ON "prescriptions"("patient_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_id_patient_unique" ON "prescriptions"("id", "patient_id");

-- CreateIndex
CREATE INDEX "prescription_medications_prescription_idx" ON "prescription_medications"("prescription_id");

-- CreateIndex
CREATE INDEX "prescription_medications_medicine_idx" ON "prescription_medications"("medicine_id");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_fields_revision_unique" ON "prescription_extracted_fields"("prescription_medication_id", "field_name", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_documents_storage_key_unique" ON "prescription_documents"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_documents_page_unique" ON "prescription_documents"("prescription_id", "page_number");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_medications" ADD CONSTRAINT "prescription_medications_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_medications" ADD CONSTRAINT "prescription_medications_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_extracted_fields" ADD CONSTRAINT "prescription_extracted_fields_prescription_medication_id_fkey" FOREIGN KEY ("prescription_medication_id") REFERENCES "prescription_medications"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_extracted_fields" ADD CONSTRAINT "prescription_extracted_fields_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_documents" ADD CONSTRAINT "prescription_documents_prescription_id_patient_id_fkey" FOREIGN KEY ("prescription_id", "patient_id") REFERENCES "prescriptions"("id", "patient_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prescription_documents" ADD CONSTRAINT "prescription_documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_valid_dates CHECK (prescription_date IS NULL OR valid_until IS NULL OR valid_until >= prescription_date);
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_manual_processing CHECK (source <> 'MANUAL' OR processing_status IS NULL);
ALTER TABLE prescription_documents ADD CONSTRAINT prescription_documents_page_positive CHECK (page_number > 0);
ALTER TABLE prescription_extracted_fields ADD CONSTRAINT prescription_fields_positive_revision CHECK (revision > 0);
ALTER TABLE prescription_extracted_fields ADD CONSTRAINT prescription_fields_confirmation_actor CHECK ((confirmed AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL) OR (NOT confirmed AND confirmed_by IS NULL AND confirmed_at IS NULL));
ALTER TABLE prescription_extracted_fields ADD CONSTRAINT prescription_fields_name CHECK (field_name IN ('medicineId','extractedName','strength','dosage','dosageUnit','frequency','frequencyUnit','duration','durationUnit','quantity','instructions','scheduledTimes','startDate','endDate'));
ALTER TABLE prescription_medications ADD CONSTRAINT prescription_medications_dosage_positive CHECK (dosage IS NULL OR (dosage > 0 AND dosage <= 99999999.9999));
ALTER TABLE prescription_medications ADD CONSTRAINT prescription_medications_frequency_positive CHECK (frequency IS NULL OR (frequency > 0 AND frequency <= 99999999.9999));
ALTER TABLE prescription_medications ADD CONSTRAINT prescription_medications_duration_positive CHECK (duration IS NULL OR (duration > 0 AND duration <= 99999999.9999));
ALTER TABLE prescription_medications ADD CONSTRAINT prescription_medications_quantity_positive CHECK (quantity IS NULL OR (quantity > 0 AND quantity <= 999999999.999));
ALTER TABLE prescription_medications ADD CONSTRAINT prescription_medications_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);
ALTER TABLE prescription_extracted_fields ADD CONSTRAINT prescription_extracted_fields_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1);
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_prescription_date_range CHECK (prescription_date IS NULL OR prescription_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_valid_until_range CHECK (valid_until IS NULL OR valid_until BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
COMMIT;
