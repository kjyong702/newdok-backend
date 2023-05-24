import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NewslettersModule } from './newsletters/newsletters.module';

@Module({
  imports: [NewslettersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
