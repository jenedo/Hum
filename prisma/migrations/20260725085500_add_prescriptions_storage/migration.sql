-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "patientProfileId" TEXT NOT NULL,
    "medicines" JSONB NOT NULL,
    "instructions" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredObject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "patientId" TEXT,
    "bucket" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'pending',
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Prescription_patientProfileId_idx" ON "Prescription"("patientProfileId");

-- CreateIndex
CREATE INDEX "Prescription_doctorProfileId_idx" ON "Prescription"("doctorProfileId");

-- CreateIndex
CREATE INDEX "Prescription_appointmentId_idx" ON "Prescription"("appointmentId");

-- CreateIndex
CREATE INDEX "StoredObject_ownerId_idx" ON "StoredObject"("ownerId");

-- CreateIndex
CREATE INDEX "StoredObject_patientId_idx" ON "StoredObject"("patientId");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
