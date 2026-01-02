import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    // Railway MySQL 등 일부 환경에서는 SSL/인증 플러그인 특성 때문에
    // Node mariadb 드라이버에 연결 옵션을 명시하지 않으면 "pool timeout"으로 뭉개져 보일 수 있습니다.
    // 문자열 URL 대신 PoolConfig를 구성하고, 연결 실패 사유를 로그로 남깁니다(비밀번호는 로깅하지 않음).
    const url = new URL(databaseUrl);
    const database = url.pathname.replace(/^\//, '');

    const adapter = new PrismaMariaDb(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : 3306,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database,
        // Railway MySQL은 자체 서명 인증서를 사용하므로 SSL 검증을 완화합니다.
        ssl: {
          rejectUnauthorized: false,
        },
        // 기본 10초 pool acquire timeout으로는 느린 네트워크/핸드셰이크에 취약할 수 있어 여유를 둡니다.
        acquireTimeout: 30_000,
        connectTimeout: 30_000,
      },
      {
        onConnectionError: (err) => {
          // eslint-disable-next-line no-console
          console.error('[PrismaMariaDb] connection error:', {
            name: err?.name,
            code: (err as any)?.code,
            message: (err as any)?.message,
          });
        },
      },
    );

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }
}
