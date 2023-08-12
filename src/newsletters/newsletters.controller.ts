import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { NewslettersService } from './newsletters.service';
import { AuthGuard } from '../guards/auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Newsletter')
@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @ApiOperation({
    summary: '개인화 추천 뉴스레터',
  })
  @Get('/recommend')
  @UseGuards(AuthGuard)
  async getRecommendedNewsletters(@Req() req: any) {
    return this.newslettersService.getRecommendedNewsletters(req.user.id);
  }

  @ApiParam({
    name: 'id',
    description: '뉴스레터 id',
    example: 1,
  })
  @ApiOperation({
    summary: '뉴스레터 브랜드 조회',
  })
  @Get('/:id')
  @UseGuards(AuthGuard)
  async getNewsletterById(@Param('id') brandId: string, @Req() req: any) {
    return this.newslettersService.getNewsletterById(brandId, req.user.id);
  }

  @ApiQuery({
    name: 'orderOpt',
    description: '정렬 옵션',
    example: '최신순',
  })
  @ApiQuery({
    name: 'industry',
    description: '종사 산업 id',
    example: 1,
  })
  @ApiQuery({
    name: 'day',
    description: '요일 id',
    example: 1,
  })
  @ApiOperation({
    summary: '모든 뉴스레터 브랜드 조회',
  })
  @Get('')
  @UseGuards(AuthGuard)
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
}
