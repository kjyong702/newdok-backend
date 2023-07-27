import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';

@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @Post('/pop3')
  @UseGuards(AuthGuard)
  async POP3(@Req() req: any) {
    return this.articlesService.POP3ForUser(req.user.id);
  }

  @Get('')
  @UseGuards(AuthGuard)
  async getArticlesForMonth(
    @Query('publicationMonth') publicationMonth: string,
    @Req() req: any,
  ) {
    return this.articlesService.getArticlesForMonth(
      publicationMonth,
      req.user.id,
    );
  }

  @Get('/:id')
  async getArticleById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }
}
