import { defineConfig } from '@prisma/config';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env so that DIRECT_URL is available during CLI commands (migrations, db push, etc.)
dotenv.config({ path: path.join(process.cwd(), '.env') });

const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const postgresUrl = [directUrl, databaseUrl].find((url) => /^postgres(ql)?:\/\//i.test((url || '').trim())) || '';

if (!postgresUrl) {
  console.warn('⚠️  Prisma config: no PostgreSQL DATABASE_URL/DIRECT_URL is set. Migrations will fail.');
}

export default defineConfig({
  earlyAccess: true,
  datasource: {
    url: postgresUrl
  }
});
