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

  @ApiQuery({
    name: 'interest',
    description: '관심사 id',
    example: 1,
  })
  @ApiOperation({ summary: '북마크한 아티클 조회' })
  @Get('/bookmark')
  @UseGuards(AuthGuard)
  async getBookmarkedArticles(
    @Query('interest') interestId: string,
    @Req() req: any,
  ) {
    return this.articlesService.getBookmarkedArticles(interestId, req.user.id);
  }

  @ApiBody({
    schema: {
      properties: {
        articleId: { type: 'string', example: '1' },
      },
    },
  })
  @ApiOperation({
    summary: '아티클 북마크 요청 및 취소',
    description:
      '현재 북마크 중인 아티클은 취소, 현재 북마크 중이 아닌 아티클은 요청 작업 수행',
  })
  @Post('/bookmark')
  @UseGuards(AuthGuard)
  async bookmarkArticle(@Body('articleId') articleId: string, @Req() req: any) {
    return this.articlesService.bookmarkArticle(articleId, req.user.id);
  }

  @ApiOperation({
    summary: '북마크한 관심사 조회',
    description: '유저가 북마크한 아티클의 관심사 리스트를 id 값으로 반환',
  })
  @Get('/bookmark/interest')
  @UseGuards(AuthGuard)
  async getUserBookmarkedInterests(@Req() req: any) {
    return this.articlesService.getUserBookmarkedInterests(req.user.id);
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
