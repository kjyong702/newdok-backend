import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SchedulerService, ArticlesService, PrismaService],
})
export class SchedulerModule {}
