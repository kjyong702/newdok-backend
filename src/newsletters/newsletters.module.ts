import { Module } from '@nestjs/common';
import { NewslettersController } from './newsletters.controller';
import { NewslettersService } from './newsletters.service';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../guards/auth.guard';

@Module({
  controllers: [NewslettersController],
  providers: [NewslettersService, PrismaService, AuthGuard],
  exports: [NewslettersService],
})
export class NewslettersModule {}
