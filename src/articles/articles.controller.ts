import { Controller, Get, Query, Param, Req, UseGuards } from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

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
}
