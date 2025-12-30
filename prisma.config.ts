import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Prisma CLI (migrate / introspect) needs a connection URL, but Prisma 7
  // no longer allows `datasource.url` inside `schema.prisma`.
  //
  // NOTE: `prisma generate` does not require a DB connection. CI builds often
  // don't have DATABASE_URL, so we only provide it when available.
  ...(process.env.DATABASE_URL
    ? {
        datasource: {
          url: process.env.DATABASE_URL,
        },
      }
    : {}),
});
