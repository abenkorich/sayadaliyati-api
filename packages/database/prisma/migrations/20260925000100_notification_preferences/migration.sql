BEGIN;
-- CreateTable
CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "dose_reminders" BOOLEAN NOT NULL,
    "expiry_reminders" BOOLEAN NOT NULL,
    "low_stock_alerts" BOOLEAN NOT NULL,
    "sharing_notifications" BOOLEAN NOT NULL,
    "system_notifications" BOOLEAN NOT NULL,
    "expiry_lead_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_expiry_lead_nonnegative CHECK (expiry_lead_days IS NULL OR expiry_lead_days >= 0);
COMMIT;
