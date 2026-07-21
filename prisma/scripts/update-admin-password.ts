import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

/** Same cost as AuthService (src/modules/auth/auth.service.ts). */
const BCRYPT_COST = 12;

function loadEnvFromDotenvFile(): void {
  const envPath = resolve(__dirname, '../../.env');
  if (!existsSync(envPath)) {
    throw new Error(`.env not found at ${envPath}`);
  }

  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFromDotenvFile();

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env',
    );
  }

  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');
  }

  const prisma = new PrismaClient();

  try {
    const admin = await prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
        email: email.toLowerCase(),
      },
    });

    if (!admin) {
      throw new Error(
        `No ADMIN user found with email ${email.toLowerCase()}. Run prisma db seed first.`,
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash },
    });

    console.log('Admin password updated successfully');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
