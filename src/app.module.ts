import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { NewslettersModule } from './newsletters/newsletters.module';
import { ArticlesModule } from './articles/articles.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    UsersModule,
    NewslettersModule,
    ArticlesModule,
    SchedulerModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
