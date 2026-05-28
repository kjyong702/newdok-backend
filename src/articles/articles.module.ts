import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { PrismaService } from '../prisma.service';
import { AuthGuard } from '../guards/auth.guard';

@Module({
  controllers: [ArticlesController],
  providers: [ArticlesService, PrismaService, AuthGuard],
  exports: [ArticlesService],
})
export class ArticlesModule {}
