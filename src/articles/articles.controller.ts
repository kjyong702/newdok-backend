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
  ApiOkResponse,
} from '@nestjs/swagger';

@ApiTags('Article')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @ApiOperation({
    summary: '날짜별 아티클 조회',
    description:
      '선택한 발행 연도와 월에 따라 날짜별로 그룹화된 아티클을 조회합니다.',
  })
  @ApiQuery({
    name: 'year',
    description: '아티클 발행연도',
    type: 'string',
    example: '2024',
  })
  @ApiQuery({
    name: 'publicationMonth',
    description: '아티클 발행월 (1월~12월)',
    type: 'string',
    example: '1',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '선택된 연도와 월에 따른 날짜별 아티클 조회 성공',
    schema: {
      example: {
        data: [
          {
            id: 1,
            publishDate: 5,
            receivedUnread: 1,
            receivedArticleList: [
              {
                brandName: '머니레터',
                imageUrl: '',
                articleTitle: 'A-Z, 시민단체 보조금 논란',
                articleId: 1,
                status: 'Unread',
              },
            ],
          },
          {
            id: 2,
            publishDate: 6,
            receivedUnread: 1,
            receivedArticleList: [
              {
                brandName: '머니레터',
                imageUrl: '',
                articleTitle: 'A-Z, 시민단체 보조금 논란',
                articleId: 1,
                status: 'Unread',
              },
            ],
          },
        ],
      },
    },
  })
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

  @ApiOperation({
    summary: '오늘 날짜 아티클 조회',
    description: '오늘 날짜에 수신 받은 아티클을 조회합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '오늘 날짜에 수신 받은 아티클 조회 성공',
    schema: {
      example: {
        publishDate: 1,
        receivedUnread: 1,
        receivedArticleList: [
          {
            brandName: '머니레터',
            imageUrl: '',
            articleTitle: 'A-Z, 시민단체 보조금 논란',
            articleId: 1,
            status: 'Unread',
          },
        ],
      },
    },
  })
  @Get('/today')
  async getTodayArticles(@Req() req: any) {
    return this.articlesService.getTodayArticles(req.user.id);
  }

  @ApiOperation({
    summary: '북마크한 아티클 조회',
    description: '사용자가 북마크한 아티클을 관심사별로 조회합니다.',
  })
  @ApiQuery({
    name: 'interest',
    description: '관심사 id',
    type: 'string',
    example: '1',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '북마크한 아티클 조회 성공',
    schema: {
      example: {
        data: {
          totalAmount: 32,
          bookmarkForMonth: [
            {
              id: 1,
              month: '2023년 11월',
              bookmark: [
                {
                  brandName: '뉴스레터 이름',
                  brandId: 23,
                  articleTitle: '뉴스레터 아티클 제목',
                  articleId: 50392,
                  sampleText: '최대 130자 기준',
                  date: '2023-11-23',
                  imageURL: '뉴스레터 브랜드 섬네일 이미지',
                },
                {
                  brandName: '뉴스레터 이름',
                  brandId: 2,
                  articleTitle: '🥯 전기차 배터리 시장에 찾아온 한파',
                  articleId: 10236,
                  sampleText: '최대 130자 기준',
                  date: '2023-11-23',
                  imageURL: '뉴스레터 브랜드 섬네일 이미지',
                },
              ],
            },
            {
              id: 2,
              month: '2023년 10월',
              bookmark: [],
            },
          ],
        },
      },
    },
  })
  @Get('/bookmark')
  async getBookmarkedArticles(
    @Query('interest') interestId: string,
    @Req() req: any,
  ) {
    return this.articlesService.getBookmarkedArticles(interestId, req.user.id);
  }

  @ApiOperation({
    summary: '아티클 북마크 요청 및 취소',
    description:
      '현재 북마크 중인 아티클은 취소하고, 북마크 중이 아닌 아티클은 요청 작업을 수행합니다.',
  })
  @ApiBody({
    schema: {
      properties: {
        articleId: {
          type: 'string',
          description: '북마크를 요청하거나 취소할 아티클 id',
          example: '1',
        },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '북마크 요청 또는 취소 성공',
    schema: {
      example: {
        message: '북마크가 추가되었습니다.',
      },
    },
  })
  @Post('/bookmark')
  async bookmarkArticle(@Body('articleId') articleId: string, @Req() req: any) {
    return this.articlesService.bookmarkArticle(articleId, req.user.id);
  }

  @ApiOperation({
    summary: '북마크한 관심사 조회',
    description:
      '유저가 북마크한 아티클의 관심사 리스트를 id 값으로 반환합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '유저가 북마크한 관심사 리스트 조회 성공',
    schema: {
      example: {
        data: [
          { id: 1, name: '경제 정치' },
          { id: 2, name: '비즈니스' },
          { id: 3, name: '과학 기술' },
        ],
      },
    },
  })
  @Get('/bookmark/interest')
  async getUserBookmarkedInterests(@Req() req: any) {
    return this.articlesService.getUserBookmarkedInterests(req.user.id);
  }

  @ApiOperation({
    summary: '아티클 읽기',
    description: '특정 id 값을 기반으로 아티클을 조회합니다.',
  })
  @ApiParam({
    name: 'id',
    description: '아티클 id',
    type: 'string',
    example: '1',
  })
  @ApiOkResponse({
    description: '특정 아티클 조회 성공',
    schema: {
      example: {
        data: {
          articleTitle: '🦔 뉴독 뉴니커, 만나서 반갑슴!',
          articleId: '82723',
          date: '2023-07-21T06:23:41.000Z',
          brandId: 1,
          brandName: 'NEWNEEK',
          articleHTML: '<p>아티클 내용</p>',
          brandImageUrl: 'https://newdok.store/public/NEWNEEK.png',
          isBookmarked: false,
        },
      },
    },
  })
  @Get('/:id')
  async getArticleById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }

  @ApiOperation({
    summary: '수신받은 아티클 개수 조회',
    description:
      '현재 사용자가 지금까지 수신받은 아티클의 총 개수를 반환합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '수신받은 아티클 개수 조회 성공',
    schema: {
      example: {
        count: 142,
      },
    },
  })
  @Get('/received/count')
  async getUserReceivedArticleCount(@Req() req: any) {
    return this.articlesService.getUserReceivedArticleCount(req.user.id);
  }
}
