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
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Newsletter')
@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @ApiOperation({
    summary: '개인화 추천 뉴스레터(회원)',
  })
  @Get('/recommend')
  @UseGuards(AuthGuard)
  async getRecommendedNewsletters(@Req() req: any) {
    return this.newslettersService.getRecommendedNewsletters(req.user.id);
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
    summary: '모든 뉴스레터 브랜드 조회(회원)',
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

  @ApiParam({
    name: 'id',
    description: '뉴스레터 id',
    example: 1,
  })
  @ApiOperation({
    summary: '뉴스레터 브랜드 조회(회원)',
  })
  @Get('/:id')
  @UseGuards(AuthGuard)
  async getNewsletterById(@Param('id') brandId: string, @Req() req: any) {
    return this.newslettersService.getNewsletterById(brandId, req.user.id);
  }

  @ApiOperation({
    summary: '뉴스레터 브랜드 조회(비회원)',
  })
  @Get('/:id/non-member')
  async getNewsletterByIdForNonMember(@Param('id') brandId: string) {
    return this.newslettersService.getNewsletterByIdForNonMember(brandId);
  }

  // TODO: 뉴스레터 구독 관련 API 엔드포인트 변경

  @Patch('/subscription/pause')
  @UseGuards(AuthGuard)
  async pauseUserNewsletterSubscription(
    @Body('newsletterId') newsletterId: string,
    @Req() req: any,
  ) {
    return this.newslettersService.pauseUserNewsletterSubscription(
      newsletterId,
      req.user.id,
    );
  }
}
