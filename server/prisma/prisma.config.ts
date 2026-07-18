import path from 'node:path';
import { defineConfig } from 'prisma/config';

const postgresUrl = withDefaultSchema([process.env.DIRECT_URL, process.env.DATABASE_URL].find((url) => /^postgres(ql)?:\/\//i.test((url || '').trim())) || '');

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  migrate: {
    async resolve({ datasourceUrl }) {
      return {
        url: datasourceUrl ?? postgresUrl,
      };
    },
  },
});

function withDefaultSchema(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value.trim().replace(/^['"]|['"]$/g, ''));
    if (url.hostname.includes('cockroachlabs.cloud') && !url.searchParams.get('schema')) {
      url.searchParams.set('schema', process.env.DATABASE_SCHEMA || 'visioncontrol');
    }
    return url.toString();
  } catch {
    return value;
  }
}
