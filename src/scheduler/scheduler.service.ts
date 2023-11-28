import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ArticlesService } from '../articles/articles.service';

@Injectable()
export class SchedulerService {
  constructor(private articlesService: ArticlesService) {}

  @Cron('0 */1 * * * *')
  async pop3() {
    return this.articlesService.POP3();
  }
}
