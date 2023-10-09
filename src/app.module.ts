import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NewslettersModule } from './newsletters/newsletters.module';
import { UsersModule } from './users/users.module';
import { ArticlesModule } from './articles/articles.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [NewslettersModule, UsersModule, ArticlesModule, SchedulerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
