BEGIN;
CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID,
  "action" VARCHAR(150) NOT NULL,
  "resource_type" VARCHAR(100) NOT NULL,
  "resource_id" UUID,
  "metadata" JSONB,
  "ip_address" INET,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor_id", "created_at");
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource_type", "resource_id");
COMMIT;
