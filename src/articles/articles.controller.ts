import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';
import { ARTICLE_STATUS } from './constants/article-status';
import { ADMIN_USER_ID } from '../common/constants/admin';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';

@ApiTags('Article')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @ApiOperation({
    summary: '[운영] 미등록 발신자 대기 목록 조회',
    description:
      '발신자 미등록으로 수집 보류(주차)된 메일을 발신자별로 집계해 반환합니다. 발신자를 확인해 POST /newsletters/:id/sender-emails로 등록하면 다음 사이클에 자동 회수됩니다. master 계정 전용.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '발신자별 대기 메일 집계',
    schema: {
      example: {
        totalPending: 3,
        pending: [
          {
            senderAddress: 'letter@inlevel9.com',
            count: 3,
            sampleSubject: '레벨나인 아홉번째 편지',
            latestReceivedAt: '2026-08-24T09:00:00.000Z',
            mailboxes: ['kjyong702@newdok.store'],
          },
        ],
        unrecoverable: [
          {
            senderAddress: '(수신 실패)',
            count: 1,
            sampleSubject: null,
            latestReceivedAt: null,
            mailboxes: ['kjyong702@newdok.store'],
          },
        ],
      },
    },
  })
  @Get('/unmatched-senders')
  async getUnmatchedSenders(@Req() req: any) {
    if (req.user.id !== ADMIN_USER_ID) {
      throw new ForbiddenException('관리자만 사용할 수 있는 기능입니다.');
    }
    return this.articlesService.getUnmatchedSenders();
  }

  @ApiOperation({
    summary: '월 단위 날짜별 아티클 존재 여부 조회',
    description:
      '선택한 발행 연도와 월에 대해, 각 날짜별로 아티클 존재 여부 및 개수를 조회합니다.',
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
    description: '선택된 연도와 월에 따른 날짜별 아티클 존재 여부 조회 성공',
    schema: {
      example: {
        data: [
          {
            publishDate: 5,
            hasArticles: true,
            totalCount: 3,
            unreadCount: 1,
          },
          {
            publishDate: 6,
            hasArticles: false,
            totalCount: 0,
            unreadCount: 0,
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
            status: ARTICLE_STATUS.UNREAD,
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
    summary: '특정 일자 아티클 조회',
    description:
      '선택한 발행 연도, 월, 일에 대해 해당 날짜에 수신 받은 아티클을 조회합니다.',
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
  @ApiQuery({
    name: 'publicationDate',
    description: '아티클 발행일 (1~31)',
    type: 'string',
    example: '15',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '특정 일자에 수신 받은 아티클 조회 성공',
    schema: {
      example: [
        {
          id: 1,
          title: 'A-Z, 시민단체 보조금 논란',
          publishDate: 5,
          status: ARTICLE_STATUS.UNREAD,
          newsletter: {
            brandName: '머니레터',
            imageUrl: '',
          },
        },
      ],
    },
  })
  @Get('/day')
  async getArticlesByDay(
    @Query('year') year: string,
    @Query('publicationMonth') publicationMonth: string,
    @Query('publicationDate') publicationDate: string,
    @Req() req: any,
  ) {
    return this.articlesService.getArticlesByDay(
      year,
      publicationMonth,
      publicationDate,
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '북마크한 아티클 조회',
    description:
      '사용자가 북마크한 아티클을 관심사별로 조회하고 정렬 기준에 따라 정렬합니다.',
  })
  @ApiQuery({
    name: 'interestId',
    description: '관심사 id (비어있으면 전체 조회)',
    type: 'string',
    example: '1',
    required: false,
  })
  @ApiQuery({
    name: 'sortBy',
    description:
      '정렬 기준 (bookmark_date: 북마크 추가순, article_date_desc: 최신 아티클순, article_date_asc: 오래된 아티클순)',
    type: 'string',
    example: 'bookmark_date',
    required: false,
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
    @Query('interestId') interestId: string,
    @Query('sortBy') sortBy: string,
    @Req() req: any,
  ) {
    return this.articlesService.getBookmarkedArticles(
      interestId,
      sortBy,
      req.user.id,
    );
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
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        action: { type: 'string', example: 'added' },
        message: { type: 'string', example: '북마크가 추가되었습니다.' },
        data: {
          type: 'object',
          properties: {
            articleId: { type: 'number', example: 1 },
            articleTitle: {
              type: 'string',
              example: '🦔 뉴독 뉴니커, 만나서 반갑슴!',
            },
            isBookmarked: { type: 'boolean', example: true },
          },
        },
      },
      example: {
        success: true,
        action: 'added',
        message: '북마크가 추가되었습니다.',
        data: {
          articleId: 1,
          articleTitle: '🦔 뉴독 뉴니커, 만나서 반갑슴!',
          isBookmarked: true,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      '잘못된 요청 (유효하지 않은 articleId, 본인 아티클이 아닌 경우)',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        error: { type: 'string' },
        statusCode: { type: 'number' },
      },
      example: {
        message: '본인이 수신받은 아티클만 북마크할 수 있습니다.',
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  @ApiNotFoundResponse({
    description: '존재하지 않는 아티클',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        error: { type: 'string' },
        statusCode: { type: 'number' },
      },
      example: {
        message: '존재하지 않는 아티클입니다.',
        error: 'Not Found',
        statusCode: 404,
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

  @ApiOperation({
    summary: '메일 서버에서 아티클 즉시 동기화 (POP3 실행)',
    description:
      'Cron 스케줄러를 기다리지 않고, 메일 서버에서 POP3로 모든 유저의 새 아티클을 즉시 가져옵니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: 'POP3 동기화 작업이 시작되었습니다.',
    schema: {
      example: {
        message: 'POP3 동기화 작업이 완료되었습니다.',
      },
    },
  })
  @Post('/refresh')
  async refreshArticles() {
    await this.articlesService.POP3();
    return { message: 'POP3 동기화 작업이 완료되었습니다.' };
  }
}
