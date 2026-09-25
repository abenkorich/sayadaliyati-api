BEGIN;
-- CreateEnum
CREATE TYPE "treatment_status" AS ENUM ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "schedule_type" AS ENUM ('FIXED_TIMES');

-- CreateEnum
CREATE TYPE "medication_event_status" AS ENUM ('TAKEN', 'MISSED', 'SKIPPED');

-- CreateTable
CREATE TABLE "treatments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "prescription_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "treatment_status" NOT NULL DEFAULT 'PLANNED',
    "activated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_medications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_id" UUID NOT NULL,
    "medicine_id" UUID NOT NULL,
    "dose" DECIMAL(12,4) NOT NULL,
    "dose_unit" VARCHAR(50) NOT NULL,
    "schedule_type" "schedule_type" NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "treatment_medication_id" UUID NOT NULL,
    "time" TIME(0) NOT NULL,
    "timezone" TEXT NOT NULL,
    "days_of_week" SMALLINT[],
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "local_date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "occurrence_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "treatment_medication_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "medication_event_status" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatments_patient_id_created_at_idx" ON "treatments"("patient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_medications_treatment_id_medicine_id_key" ON "treatment_medications"("treatment_id", "medicine_id");

-- CreateIndex
CREATE INDEX "medication_schedules_treatment_medication_id_idx" ON "medication_schedules"("treatment_medication_id");

-- CreateIndex
CREATE INDEX "medication_occurrences_patient_id_scheduled_at_idx" ON "medication_occurrences"("patient_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "medication_occurrences_schedule_id_local_date_key" ON "medication_occurrences"("schedule_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "medication_events_occurrence_id_key" ON "medication_events"("occurrence_id");

-- CreateIndex
CREATE INDEX "medication_events_patient_id_scheduled_at_idx" ON "medication_events"("patient_id", "scheduled_at");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_prescription_id_patient_id_fkey" FOREIGN KEY ("prescription_id", "patient_id") REFERENCES "prescriptions"("id", "patient_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "treatment_medications" ADD CONSTRAINT "treatment_medications_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "treatment_medications" ADD CONSTRAINT "treatment_medications_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_schedules" ADD CONSTRAINT "medication_schedules_treatment_medication_id_fkey" FOREIGN KEY ("treatment_medication_id") REFERENCES "treatment_medications"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_occurrences" ADD CONSTRAINT "medication_occurrences_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_occurrences" ADD CONSTRAINT "medication_occurrences_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "medication_schedules"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_events" ADD CONSTRAINT "medication_events_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "medication_occurrences"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_events" ADD CONSTRAINT "medication_events_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "medication_events" ADD CONSTRAINT "medication_events_treatment_medication_id_fkey" FOREIGN KEY ("treatment_medication_id") REFERENCES "treatment_medications"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE treatments ADD CONSTRAINT treatments_date_range CHECK (end_date >= start_date AND end_date - start_date < 366);
ALTER TABLE treatment_medications ADD CONSTRAINT treatment_dose_range CHECK (dose BETWEEN 0.0001 AND 99999999.9999 AND length(trim(dose_unit)) > 0);
ALTER TABLE medication_schedules ADD CONSTRAINT schedule_date_range CHECK (end_date >= start_date AND end_date - start_date < 366);
ALTER TABLE medication_schedules ADD CONSTRAINT schedule_weekdays CHECK (cardinality(days_of_week) BETWEEN 1 AND 7 AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);
CREATE FUNCTION verify_occurrence_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM medication_schedules s JOIN treatment_medications m ON m.id=s.treatment_medication_id JOIN treatments t ON t.id=m.treatment_id
   WHERE s.id=NEW.schedule_id AND t.patient_id=NEW.patient_id AND t.status='ACTIVE' AND s.enabled
   AND NEW.timezone=s.timezone AND NEW.local_date BETWEEN s.start_date AND s.end_date
   AND EXTRACT(DOW FROM NEW.local_date)::smallint=ANY(s.days_of_week)
   AND (NEW.scheduled_at AT TIME ZONE s.timezone)::date=NEW.local_date
   AND (NEW.scheduled_at AT TIME ZONE s.timezone)::time=s.time
 ) THEN RAISE EXCEPTION 'Invalid occurrence scope'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER occurrence_scope BEFORE INSERT OR UPDATE ON medication_occurrences FOR EACH ROW EXECUTE FUNCTION verify_occurrence_scope();
CREATE FUNCTION verify_event_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM medication_occurrences o JOIN medication_schedules s ON s.id=o.schedule_id
   WHERE o.id=NEW.occurrence_id AND o.patient_id=NEW.patient_id
   AND s.treatment_medication_id=NEW.treatment_medication_id AND o.scheduled_at=NEW.scheduled_at
 ) THEN RAISE EXCEPTION 'Invalid event scope'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER event_scope BEFORE INSERT OR UPDATE ON medication_events FOR EACH ROW EXECUTE FUNCTION verify_event_scope();
COMMIT;
