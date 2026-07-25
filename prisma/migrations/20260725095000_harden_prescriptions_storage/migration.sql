BEGIN;

-- Create enums only when missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'PrescriptionStatus'
  ) THEN
    CREATE TYPE "PrescriptionStatus"
      AS ENUM ('ISSUED', 'SUPERSEDED', 'VOIDED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'StorageScanStatus'
  ) THEN
    CREATE TYPE "StorageScanStatus"
      AS ENUM (
        'PENDING',
        'VALIDATING',
        'PASSED',
        'REJECTED',
        'QUARANTINED',
        'ERROR'
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'StoragePurpose'
  ) THEN
    CREATE TYPE "StoragePurpose"
      AS ENUM (
        'MEDICAL_RECORD',
        'LAB_RESULT',
        'IMAGING',
        'PRESCRIPTION_ATTACHMENT',
        'OTHER'
      );
  END IF;
END
$$;

-- Prescription columns may already exist after a partial attempt.

ALTER TABLE "Prescription"
  ADD COLUMN IF NOT EXISTS "status"
    "PrescriptionStatus" NOT NULL DEFAULT 'ISSUED',
  ADD COLUMN IF NOT EXISTS "version"
    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "supersedesId"
    TEXT,
  ADD COLUMN IF NOT EXISTS "voidedAt"
    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "voidReason"
    TEXT;

-- Convert StoredObject purpose to enum only when it is not already enum.

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT c.udt_name
  INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'StoredObject'
    AND c.column_name = 'purpose';

  IF current_type IS NULL THEN
    ALTER TABLE "StoredObject"
      ADD COLUMN "purpose"
        "StoragePurpose" NOT NULL DEFAULT 'MEDICAL_RECORD';
  ELSIF current_type <> 'StoragePurpose' THEN
    ALTER TABLE "StoredObject"
      ALTER COLUMN "purpose" DROP DEFAULT;

    ALTER TABLE "StoredObject"
      ALTER COLUMN "purpose" TYPE "StoragePurpose"
      USING (
        CASE UPPER("purpose"::TEXT)
          WHEN 'MEDICAL_RECORD'
            THEN 'MEDICAL_RECORD'::"StoragePurpose"
          WHEN 'LAB_RESULT'
            THEN 'LAB_RESULT'::"StoragePurpose"
          WHEN 'IMAGING'
            THEN 'IMAGING'::"StoragePurpose"
          WHEN 'PRESCRIPTION_ATTACHMENT'
            THEN 'PRESCRIPTION_ATTACHMENT'::"StoragePurpose"
          ELSE 'OTHER'::"StoragePurpose"
        END
      );
  END IF;
END
$$;

ALTER TABLE "StoredObject"
  ALTER COLUMN "purpose"
  SET DEFAULT 'MEDICAL_RECORD';

ALTER TABLE "StoredObject"
  ALTER COLUMN "purpose"
  SET NOT NULL;

-- Convert StoredObject scanStatus only when it is not already enum.

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT c.udt_name
  INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'StoredObject'
    AND c.column_name = 'scanStatus';

  IF current_type IS NULL THEN
    ALTER TABLE "StoredObject"
      ADD COLUMN "scanStatus"
        "StorageScanStatus" NOT NULL DEFAULT 'PENDING';
  ELSIF current_type <> 'StorageScanStatus' THEN
    ALTER TABLE "StoredObject"
      ALTER COLUMN "scanStatus" DROP DEFAULT;

    ALTER TABLE "StoredObject"
      ALTER COLUMN "scanStatus" TYPE "StorageScanStatus"
      USING (
        CASE UPPER("scanStatus"::TEXT)
          WHEN 'PENDING'
            THEN 'PENDING'::"StorageScanStatus"
          WHEN 'VALIDATING'
            THEN 'VALIDATING'::"StorageScanStatus"
          WHEN 'PASSED'
            THEN 'PASSED'::"StorageScanStatus"
          WHEN 'REJECTED'
            THEN 'REJECTED'::"StorageScanStatus"
          WHEN 'QUARANTINED'
            THEN 'QUARANTINED'::"StorageScanStatus"
          WHEN 'ERROR'
            THEN 'ERROR'::"StorageScanStatus"
          ELSE 'ERROR'::"StorageScanStatus"
        END
      );
  END IF;
END
$$;

ALTER TABLE "StoredObject"
  ALTER COLUMN "scanStatus"
  SET DEFAULT 'PENDING';

ALTER TABLE "StoredObject"
  ALTER COLUMN "scanStatus"
  SET NOT NULL;

-- Upload and validation fields.

ALTER TABLE "StoredObject"
  ADD COLUMN IF NOT EXISTS "uploadExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "sha256" TEXT;

UPDATE "StoredObject"
SET "uploadExpiresAt" =
  COALESCE("createdAt", CURRENT_TIMESTAMP) + INTERVAL '2 hours'
WHERE "uploadExpiresAt" IS NULL;

ALTER TABLE "StoredObject"
  ALTER COLUMN "uploadExpiresAt" SET NOT NULL;

ALTER TABLE "StoredObject"
  ALTER COLUMN "uploadExpiresAt" DROP DEFAULT;

-- Database uniqueness and concurrency protection.

CREATE UNIQUE INDEX IF NOT EXISTS
  "Prescription_appointmentId_version_key"
ON "Prescription" ("appointmentId", "version");

CREATE UNIQUE INDEX IF NOT EXISTS
  "Prescription_one_active_per_appointment_key"
ON "Prescription" ("appointmentId")
WHERE "status" = 'ISSUED';

CREATE UNIQUE INDEX IF NOT EXISTS
  "StoredObject_bucket_objectPath_key"
ON "StoredObject" ("bucket", "objectPath");

-- Restrictive foreign keys.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Prescription_supersedesId_fkey'
  ) THEN
    ALTER TABLE "Prescription"
      ADD CONSTRAINT "Prescription_supersedesId_fkey"
      FOREIGN KEY ("supersedesId")
      REFERENCES "Prescription"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'StoredObject_patientId_fkey'
  ) THEN
    ALTER TABLE "StoredObject"
      ADD CONSTRAINT "StoredObject_patientId_fkey"
      FOREIGN KEY ("patientId")
      REFERENCES "PatientProfile"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END
$$;

-- Block direct client table access.

ALTER TABLE "Prescription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredObject" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE "Prescription"
FROM anon, authenticated;

REVOKE ALL PRIVILEGES
ON TABLE "StoredObject"
FROM anon, authenticated;

COMMIT;