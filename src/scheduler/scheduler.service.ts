import { Injectable } from '@nestjs/common';
import { ArticlesService } from '../articles/articles.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SchedulerService {
  constructor(
    private articlesService: ArticlesService,
    private prisma: PrismaService,
  ) {}
}
