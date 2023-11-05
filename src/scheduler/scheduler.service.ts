import { Injectable } from '@nestjs/common';
import { ArticlesService } from '../articles/articles.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class SchedulerService {
  constructor(private articlesService: ArticlesService) {}

  @Cron('0 */1 * * * *')
  async pop3() {
    await this.articlesService.POP3();
  }
}
