import { Controller, Get, Post, Param, Req, UseGuards } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';

@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post('/test1')
  @UseGuards(AuthGuard)
  async test1(@Req() req: any) {
    return this.articlesService.POP3ForUser(req.user.id);
  }

  @Get('/:id')
  async getArticleById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }
}
