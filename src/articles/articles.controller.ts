import {
  Controller,
  Get,
  Delete,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  @ApiParam({
    name: 'id',
    description: '아티클 id',
    example: 1,
  })
  @ApiOperation({ summary: '아티클 삭제' })
  @Delete('/:id')
  async deleteArticleById(@Param('id') id: string) {
    return this.articlesService.deleteArticleById(id);
  }

  @ApiOperation({ summary: '아티클 전체 삭제' })
  @Delete('')
  async deleteArticles() {
    return this.articlesService.deleteArticles();
  }
}
