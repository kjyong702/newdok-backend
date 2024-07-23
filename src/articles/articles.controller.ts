import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Article')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @ApiQuery({
    name: 'publicationMonth',
    description: '아티클 수신 날짜(월)',
    example: 1,
  })
  @ApiOperation({ summary: '월별 아티클 조회' })
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

  @ApiParam({
    name: 'id',
    description: '아티클 id',
    example: 1,
  })
  @ApiOperation({ summary: '아티클 읽기' })
  @Get('/:id')
  async getArticleById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }

  @ApiBody({
    schema: {
      properties: {
        articleId: { type: 'string', example: '1' },
      },
    },
  })
  @ApiOperation({ summary: '아티클 북마크 요청' })
  @Post('/bookmark')
  @UseGuards(AuthGuard)
  async bookmarkArticle(@Body('articleId') articleId: string, @Req() req: any) {
    return this.articlesService.bookmarkArticle(articleId, req.user.id);
  }
}
