import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // Prisma CLI (migrate / introspect) needs a connection URL, but Prisma 7
  // no longer allows `datasource.url` inside `schema.prisma`.
  datasource: {
    url: env('DATABASE_URL'),
  },
});
