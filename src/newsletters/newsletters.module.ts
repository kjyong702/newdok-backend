import { Module } from '@nestjs/common';
import { NewslettersController } from './newsletters.controller';
import { NewslettersService } from './newsletters.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [NewslettersController],
  providers: [NewslettersService, PrismaService],
})
export class NewslettersModule {}
