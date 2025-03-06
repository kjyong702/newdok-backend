import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @ApiOperation({
    summary: '뉴스레터 브랜드 검색',
    description: '검색어를 통해 뉴스레터 브랜드를 검색합니다.',
  })
  @ApiQuery({
    name: 'brandName',
    description: '검색어',
    type: 'string',
    example: 'NEWNEEK',
  })
  @Get('/newsletter')
  async searchNewsletters(@Query('brandName') brandName: string) {
    return await this.searchService.searchNewsletters(brandName);
  }

  @ApiOperation({
    summary: '아티클 검색',
    description: '검색어를 통해 아티클을 검색합니다.',
  })
  @ApiQuery({
    name: 'keyword',
    description: '검색어',
    type: 'string',
    example: '머니레터',
  })
  @Get('/article')
  async searchArticles(@Query('keyword') keyword: string) {
    return await this.searchService.searchArticles(keyword);
  }
}
