import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NewslettersModule } from './newsletters/newsletters.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [NewslettersModule, UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
