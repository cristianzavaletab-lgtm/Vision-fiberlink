import path from 'node:path';
import { defineConfig } from 'prisma/config';

const postgresUrl = [process.env.DIRECT_URL, process.env.DATABASE_URL].find((url) => /^postgres(ql)?:\/\//i.test((url || '').trim())) || '';

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
