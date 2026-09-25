BEGIN;
-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('DOSE_DUE', 'DOSE_MISSED', 'EXPIRY', 'LOW_STOCK', 'PRESCRIPTION', 'SHARING', 'SYSTEM');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "occurrence_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_occurrence_id_key" ON "notifications"("occurrence_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_occurrence_id_user_id_key" ON "notifications"("occurrence_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "medication_occurrences_id_patient_id_key" ON "medication_occurrences"("id", "patient_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_occurrence_id_user_id_fkey" FOREIGN KEY ("occurrence_id", "user_id") REFERENCES "medication_occurrences"("id", "patient_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE notifications ADD CONSTRAINT notifications_dose_only CHECK (type='DOSE_DUE');
COMMIT;
