import dotenv from 'dotenv';
dotenv.config();
import { setupDb } from './setup';

async function main() {
  console.log('Seeding database...');
  await setupDb();
  console.log('Seed complete.');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
