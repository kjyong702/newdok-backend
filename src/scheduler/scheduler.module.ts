import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArticlesModule } from '../articles/articles.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot(), ArticlesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
