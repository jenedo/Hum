-- AlterTable
ALTER TABLE "User" ADD COLUMN     "supabaseAuthUserId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseAuthUserId_key" ON "User"("supabaseAuthUserId");
