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
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Article')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @ApiQuery({
    name: 'year',
    description: '아티클 발행연도',
    example: 2024,
  })
  @ApiQuery({
    name: 'publicationMonth',
    description: '아티클 발행월',
    example: 1,
  })
  @ApiOperation({ summary: '날짜별 아티클 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('')
  async getArticlesByDate(
    @Query('year') year: string,
    @Query('publicationMonth') publicationMonth: string,
    @Req() req: any,
  ) {
    return this.articlesService.getArticlesByDate(
      year,
      publicationMonth,
      req.user.id,
    );
  }

  @ApiOperation({ summary: '오늘 날짜 아티클 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('/today')
  async getTodayArticles(@Req() req: any) {
    return this.articlesService.getTodayArticles(req.user.id);
  }

  @ApiQuery({
    name: 'interest',
    description: '관심사 id',
    example: 1,
  })
  @ApiOperation({ summary: '북마크한 아티클 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('/bookmark')
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
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Post('/bookmark')
  async bookmarkArticle(@Body('articleId') articleId: string, @Req() req: any) {
    return this.articlesService.bookmarkArticle(articleId, req.user.id);
  }

  @ApiOperation({
    summary: '북마크한 관심사 조회',
    description: '유저가 북마크한 아티클의 관심사 리스트를 id 값으로 반환',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @Get('/bookmark/interest')
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
