import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

@Injectable()
export class ServicoPrisma extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configuracao: ConfigService) {
    const connectionString = configuracao.getOrThrow<string>('DATABASE_URL');
    const schema = new URL(connectionString).searchParams.get('schema') || undefined;
    super({
      adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }, { schema }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
