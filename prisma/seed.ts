import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set to seed an admin user',
    );
  }

  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');
  }

  const prisma = new PrismaClient();

  try {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: Role.ADMIN },
    });

    if (existingAdmin) {
      console.log(
        `Admin already exists (${existingAdmin.email}); skipping seed.`,
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const admin = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        role: Role.ADMIN,
      },
    });

    console.log(`Seeded ADMIN user: ${admin.email} (id=${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
