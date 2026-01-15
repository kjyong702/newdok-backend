import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NewslettersService } from './newsletters.service';
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

@ApiTags('Newsletter')
@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @ApiOperation({ summary: '구독 중인 뉴스레터 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '구독 중인 뉴스레터 리스트 조회 성공',
    schema: {
      example: [
        {
          id: 1,
          brandName: 'NEWNEEK',
          imageUrl: 'https://newdok.shop/public/NEWNEEK.png',
          publicationCycle: '매주 평일 아침',
        },
        {
          id: 99,
          brandName: '돈키레터',
          imageUrl: 'https://newdok.shop/public/돈키레터.png',
          publicationCycle: '매주 평일 오전 7시',
        },
      ],
    },
  })
  @Get('/subscription/active')
  async getUserNewsletterSubscriptions(@Req() req: any) {
    return this.newslettersService.getUserNewsletterSubscriptions(req.user.id);
  }

  @ApiOperation({ summary: '구독 중지 중인 뉴스레터 조회' })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '구독 중지 중인 뉴스레터 리스트 조회 성공',
    schema: {
      example: [
        {
          id: 1,
          brandName: 'NEWNEEK',
          imageUrl: 'https://newdok.shop/public/NEWNEEK.png',
          publicationCycle: '매주 평일 아침',
        },
        {
          id: 99,
          brandName: '돈키레터',
          imageUrl: 'https://newdok.shop/public/돈키레터.png',
          publicationCycle: '매주 평일 오전 7시',
        },
      ],
    },
  })
  @Get('/subscription/paused')
  async getPausedUserNewsletterSubscriptions(@Req() req: any) {
    return this.newslettersService.getPausedUserNewsletterSubscriptions(
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '최선 결과 조회 (교집합)',
    description:
      '유저가 미리 설정한 산업군과 관심사의 교집합에 해당하는 뉴스레터 브랜드를 추천합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '최선 결과 뉴스레터 리스트 조회 성공',
    schema: {
      example: [
        {
          id: 2,
          brandName: 'Daily Byte',
          firstDescription:
            '꼭 알아야 할 비즈니스・경제 이슈, 데일리바이트에서 핵심만 쉽게',
          secondDescription: '가장 쉽고 똑똑한 비즈니스 뉴스 읽기',
          publicationCycle: '매주 평일 오전 6시',
          subscribeUrl: 'https://page.stibee.com/subscriptions/81111',
          imageUrl: 'https://newdok.shop/public/Daily Byte.png',
          createdAt: '2023-07-15T07:30:42.996Z',
          updatedAt: '2023-09-27T07:13:17.112Z',
          industries: [
            {
              id: 2,
              name: 'F&B',
            },
          ],
          interests: [
            {
              id: 1,
              name: '경제・시사',
            },
          ],
        },
      ],
    },
  })
  @Get('/recommend/intersection')
  async getIntersectionNewsletters(@Req() req: any) {
    return this.newslettersService.getIntersectionNewsletters(req.user.id);
  }

  @ApiOperation({
    summary: '차선 결과 조회 (합집합)',
    description:
      '유저가 미리 설정한 산업군과 관심사의 합집합에 해당하는 뉴스레터 브랜드를 최대 6개 랜덤으로 추천합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '차선 결과 뉴스레터 리스트 조회 성공 (최대 6개)',
    schema: {
      example: [
        {
          id: 4,
          brandName: '외계레터',
          firstDescription:
            '당신만을 위한 외식업 세계,  지구인의 외식업 문화 연구 이야기',
          secondDescription: '당신만을 위한 외식업 세계의 이야기',
          publicationCycle: '매주 금요일',
          subscribeUrl: 'https://foodworld-letter.stibee.com/subscribe/',
          imageUrl: 'https://newdok.shop/public/외계레터.png',
          createdAt: '2023-07-15T07:30:42.996Z',
          updatedAt: '2023-09-27T07:13:17.112Z',
          industries: [
            {
              id: 2,
              name: 'F&B',
            },
            {
              id: 11,
              name: '유통・무역',
            },
          ],
          interests: [
            {
              id: 4,
              name: '트렌드',
            },
            {
              id: 11,
              name: '푸드・드링크',
            },
          ],
        },
      ],
    },
  })
  @Get('/recommend/union')
  async getUnionNewsletters(@Req() req: any) {
    return this.newslettersService.getUnionNewsletters(req.user.id);
  }

  @ApiOperation({
    summary: '개인화 추천 뉴스레터(회원) - Deprecated',
    description:
      '유저가 미리 설정한 산업군, 관심사에 기반하여 뉴스레터 브랜드를 추천한다. 성능 개선을 위해 /recommend/intersection과 /recommend/union을 분리하여 사용하세요.',
    deprecated: true,
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '추천 뉴스레터 리스트 조회 성공',
    schema: {
      example: {
        intersection: [
          {
            id: 2,
            brandName: 'Daily Byte',
            firstDescription:
              '꼭 알아야 할 비즈니스・경제 이슈, 데일리바이트에서 핵심만 쉽게',
            secondDescription: '가장 쉽고 똑똑한 비즈니스 뉴스 읽기',
            publicationCycle: '매주 평일 오전 6시',
            subscribeUrl: 'https://page.stibee.com/subscriptions/81111',
            imageUrl: 'https://newdok.shop/public/Daily Byte.png',
            createdAt: '2023-07-15T07:30:42.996Z',
            updatedAt: '2023-09-27T07:13:17.112Z',
            industries: [
              {
                id: 2,
                name: 'F&B',
              },
            ],
            interests: [
              {
                id: 1,
                name: '경제・시사',
              },
            ],
          },
        ],
        union: [
          {
            id: 4,
            brandName: '외계레터',
            firstDescription:
              '당신만을 위한 외식업 세계,  지구인의 외식업 문화 연구 이야기',
            secondDescription: '당신만을 위한 외식업 세계의 이야기',
            publicationCycle: '매주 금요일',
            subscribeUrl: 'https://foodworld-letter.stibee.com/subscribe/',
            imageUrl: 'https://newdok.shop/public/외계레터.png',
            createdAt: '2023-07-15T07:30:42.996Z',
            updatedAt: '2023-09-27T07:13:17.112Z',
            industries: [
              {
                id: 2,
                name: 'F&B',
              },
              {
                id: 11,
                name: '유통・무역',
              },
            ],
            interests: [
              {
                id: 4,
                name: '트렌드',
              },
              {
                id: 11,
                name: '푸드・드링크',
              },
            ],
          },
        ],
      },
    },
  })
  @Get('/recommend')
  async getRecommendedNewsletters(@Req() req: any) {
    return this.newslettersService.getRecommendedNewsletters(req.user.id);
  }

  @ApiOperation({
    summary: '모든 뉴스레터 브랜드 조회(회원)',
    description:
      '유저가 선택한 산업군, 발행 요일, 정렬 기준에 따라 뉴스레터 브랜드 목록을 필터링한다.',
  })
  @ApiQuery({
    name: 'orderOpt',
    description: '정렬 옵션',
    type: 'string',
    example: '최신순',
  })
  @ApiQuery({
    name: 'industry',
    description: '종사 산업 id',
    type: 'string',
    example: '1',
  })
  @ApiQuery({
    name: 'day',
    description: '요일 id',
    type: 'string',
    example: '1',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '필터링된 뉴스레터 리스트 조회 성공',
    schema: {
      example: [
        {
          brandId: 1,
          brandName: 'NEWNEEK',
          imageUrl: 'https://oh-lolly-day.com/web/upload/category/letter2.png',
          interests: [
            {
              id: 1,
              name: '경제・시사',
            },
            {
              id: 2,
              name: '비즈니스',
            },
            {
              id: 4,
              name: '트렌드',
            },
          ],
          isSubscribed: 'CONFIRMED',
          shortDescription: '세상 돌아가는 소식, 뉴닉으로!',
          subscriptionCount: 7,
        },
        {
          brandId: 2,
          brandName: 'Daily Byte',
          imageUrl: 'https://newdok.shop/public/Daily Byte.png',
          interests: [
            {
              id: 1,
              name: '경제・시사',
            },
            {
              id: 2,
              name: '비즈니스',
            },
            {
              id: 4,
              name: '트렌드',
            },
            {
              id: 8,
              name: '취미・자기계발',
            },
          ],
          isSubscribed: 'INITIAL',
          shortDescription: '가장 쉽고 똑똑한 비즈니스 뉴스 읽기',
          subscriptionCount: 3,
        },
      ],
    },
  })
  @Get('')
  async getAllNewsletters(
    @Query('orderOpt') orderOpt: string,
    @Query('industry') industries: string[],
    @Query('day') days: string[],
    @Req() req: any,
  ) {
    return this.newslettersService.getAllNewsletters(
      orderOpt,
      industries,
      days,
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '모든 뉴스레터 브랜드 조회(비회원)',
  })
  @Get('/non-member')
  async getAllNewslettersForNonMember(
    @Query('orderOpt') orderOpt: string,
    @Query('industry') industries: string[],
    @Query('day') days: string[],
  ) {
    return this.newslettersService.getAllNewslettersForNonMember(
      orderOpt,
      industries,
      days,
    );
  }

  @ApiOperation({
    summary: '뉴스레터 브랜드 조회(회원)',
    description:
      '주어진 id 값에 해당하는 뉴스레터 브랜드의 상세 정보를 조회한다.',
  })
  @ApiParam({
    name: 'id',
    description: '뉴스레터 id',
    type: 'string',
    example: '1',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '뉴스레터 브랜드 조회 성공',
    schema: {
      example: {
        brandId: 1,
        brandName: 'NEWNEEK',
        detailDescription:
          '세상 돌아가는 소식은 궁금한데, 시간이 없다고요? <뉴닉>은 신문 볼 새 없이 바쁘지만, 세상과의 연결고리는 튼튼하게 유지하고 싶은 여러분들을 위해 세상 돌아가는 소식을 모두 담아 간단하게 정리해드려요.',
        interests: [
          { id: 1, name: '경제・시사' },
          { id: 2, name: '비즈니스' },
        ],
        publicationCycle: '매주 평일 아침',
        subscribeUrl: 'https://newneek.co/',
        imageUrl: 'https://newdok.shop/public/NEWNEEK.png',
        brandArticleList: [
          {
            id: 42902,
            title: '🦔‘터보’ 붙은 뉴 챗GPT, 뭐가 달라졌을까?',
            date: '2023-11-13T05:28:49.000Z',
          },
          {
            id: 42834,
            title: '(광고)🦔팩트체크: 빈대, 택배로 옮는다고?',
            date: '2023-11-10T06:37:44.000Z',
          },
          {
            id: 42802,
            title: '🦔11월에도 모기가 나의 발을 물었어!',
            date: '2023-11-09T05:27:41.000Z',
          },
        ],
        isSubscribed: 'CONFIRMED',
        subscribeCheck: false,
      },
    },
  })
  @Get('/:id')
  async getNewsletterById(@Param('id') brandId: string, @Req() req: any) {
    return this.newslettersService.getNewsletterById(brandId, req.user.id);
  }

  @ApiOperation({
    summary: '뉴스레터 구독 중지',
    description: '사용자가 구독 중인 뉴스레터를 일시 구독 중지합니다.',
  })
  @ApiBody({
    schema: {
      properties: {
        newsletterId: {
          type: 'string',
          description: '구독 중지할 뉴스레터 Id',
          example: '15',
        },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '구독이 성공적으로 중지되었습니다.',
    schema: {
      example: {
        userId: 91,
        newsletterId: 15,
        status: 'PAUSED',
      },
    },
  })
  @Patch('/subscription/pause')
  async pauseUserNewsletterSubscription(
    @Body('newsletterId') newsletterId: string,
    @Req() req: any,
  ) {
    return this.newslettersService.pauseUserNewsletterSubscription(
      newsletterId,
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '뉴스레터 구독 재개',
    description: '구독 중지 중인 뉴스레터를 다시 구독합니다.',
  })
  @ApiBody({
    schema: {
      properties: {
        newsletterId: {
          type: 'string',
          description: '구독을 재개할 뉴스레터 Id',
          example: '15',
        },
      },
    },
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '구독이 성공적으로 재개되었습니다.',
    schema: {
      example: {
        userId: 91,
        newsletterId: 15,
        status: 'CONFIRMED',
      },
    },
  })
  @Patch('/subscription/resume')
  async resumeUserNewsletterSubscription(
    @Body('newsletterId') newsletterId: string,
    @Req() req: any,
  ) {
    return this.newslettersService.resumeUserNewsletterSubscription(
      newsletterId,
      req.user.id,
    );
  }

  @ApiOperation({
    summary: '뉴스레터 브랜드 조회(비회원)',
  })
  @Get('/:id/non-member')
  async getNewsletterByIdForNonMember(@Param('id') brandId: string) {
    return this.newslettersService.getNewsletterByIdForNonMember(brandId);
  }

  @ApiOperation({
    summary: '구독 중인 뉴스레터 개수 조회',
    description: '현재 사용자가 구독 중인 뉴스레터의 총 개수를 반환합니다.',
  })
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @ApiOkResponse({
    description: '구독 중인 뉴스레터 개수 조회 성공',
    schema: {
      example: {
        count: 5,
      },
    },
  })
  @Get('/subscription/count')
  async getUserSubscriptionCount(@Req() req: any) {
    return this.newslettersService.getUserSubscriptionCount(req.user.id);
  }
}
