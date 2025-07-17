import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiOkResponse,
} from '@nestjs/swagger';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiOperation({
    summary: '뉴스레터 브랜드 검색',
    description:
      '뉴스레터 브랜드명을 검색합니다. 띄어쓰기에 관계없이 키워드가 포함되면 검색됩니다.',
  })
  @ApiQuery({
    name: 'brandName',
    description: '검색할 뉴스레터 브랜드명',
    type: 'string',
    example: '뉴닉',
  })
  @ApiOkResponse({
    description: '뉴스레터 브랜드 검색 결과',
    schema: {
      example: [
        {
          id: 1,
          brandName: 'NEWNEEK',
          firstDescription: '세상 돌아가는 소식, 뉴닉으로!',
          imageUrl: 'https://newdok.shop/public/NEWNEEK.png',
        },
      ],
    },
  })
  @Get('/newsletter')
  async searchNewsletters(@Query('brandName') brandName: string) {
    return await this.searchService.searchNewsletters(brandName);
  }

  @ApiOperation({
    summary: '아티클 검색',
    description:
      '키워드를 통해 아티클 제목과 본문에서 검색합니다. 띄어쓰기를 정확히 반영하여 검색됩니다.',
  })
  @ApiQuery({
    name: 'keyword',
    description: '검색할 키워드',
    type: 'string',
    example: '인공지능',
  })
  @ApiOkResponse({
    description: '아티클 검색 결과',
    schema: {
      example: {
        message: "'인공지능'에 대한 5개의 검색 결과를 찾았습니다.",
        results: [
          {
            id: 42902,
            title: "🦔'터보' 붙은 뉴 챗GPT, 뭐가 달라졌을까?",
            matchedText:
              '인공지능 기술의 발전으로 새로운 챗GPT가 출시되었습니다...',
            date: '2023-11-13T05:28:49.000Z',
            newsletter: {
              id: 1,
              brandName: 'NEWNEEK',
              imageUrl: 'https://newdok.shop/public/NEWNEEK.png',
            },
            matchType: 'title',
          },
        ],
        totalCount: 5,
      },
    },
  })
  @Get('/article')
  async searchArticles(@Query('keyword') keyword: string) {
    return await this.searchService.searchArticles(keyword);
  }
}
