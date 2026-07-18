const { execFileSync } = require('child_process');
const { Pool } = require('pg');

const schema = process.env.DATABASE_SCHEMA || schemaFromUrl(process.env.DATABASE_URL || process.env.DIRECT_URL || '') || 'visioncontrol';
const connectionString = stripSchemaParam(process.env.DATABASE_URL || process.env.DIRECT_URL || '');

main().catch((error) => {
  console.error('[PrismaSchemaSync] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});

async function main() {
  if (!connectionString || !/^postgres(ql)?:\/\//i.test(connectionString)) {
    console.warn('[PrismaSchemaSync] skipped: DATABASE_URL/DIRECT_URL is not PostgreSQL/CockroachDB.');
    return;
  }

  await ensureSchema();
  await unlockExistingTables();

  let lastError = null;
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      runPrismaPush();
      console.log(`[PrismaSchemaSync] db push completed on attempt ${attempt}.`);
      return;
    } catch (error) {
      lastError = error;
      const lockedTable = schemaLockedTable(error);
      if (!lockedTable) throw error;
      console.warn(`[PrismaSchemaSync] ${lockedTable} is schema-locked. Unlocking and retrying...`);
      await unlockTable(lockedTable);
    }
  }

  throw lastError;
}

function runPrismaPush() {
  const command = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
  execFileSync(command, ['db', 'push', '--accept-data-loss', '--schema=prisma/schema.prisma'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
}

async function ensureSchema() {
  const pool = poolForDatabase();
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function unlockExistingTables() {
  const pool = poolForDatabase();
  try {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    );
    for (const row of result.rows) {
      await unlockTable(row.table_name, pool);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function unlockTable(tableName, existingPool) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) return;
  const pool = existingPool || poolForDatabase();
  try {
    await pool.query(`ALTER TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(tableName)} SET (schema_locked = false)`);
    console.log(`[PrismaSchemaSync] unlocked ${schema}.${tableName}`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (!/unrecognized|unknown|does not exist|invalid parameter/i.test(message)) {
      console.warn(`[PrismaSchemaSync] could not unlock ${schema}.${tableName}: ${message}`);
    }
  } finally {
    if (!existingPool) await pool.end().catch(() => undefined);
  }
}

function poolForDatabase() {
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}

function schemaLockedTable(error) {
  const message = error && error.message ? error.message : String(error);
  return message.match(/table \"([^\"]+)\" is locked/i)?.[1] || '';
}

function schemaFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim().replace(/^['"]|['"]$/g, ''));
    return url.searchParams.get('schema') || '';
  } catch {
    return '';
  }
}

function stripSchemaParam(value) {
  try {
    const url = new URL(String(value || '').trim().replace(/^['"]|['"]$/g, ''));
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return value;
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
