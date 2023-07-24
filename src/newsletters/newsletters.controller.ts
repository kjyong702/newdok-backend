import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { NewslettersService } from './newsletters.service';
import { AuthGuard } from '../guards/auth.guard';

@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @Get('/recommend')
  @UseGuards(AuthGuard)
  async getRecommendedNewsletters(@Req() req: any) {
    return this.newslettersService.getRecommendedNewsletters(req.user.id);
  }

  @Get('/:id')
  @UseGuards(AuthGuard)
  async getNewsletterById(@Param('id') brandId: string, @Req() req: any) {
    return this.newslettersService.getNewsletterById(brandId, req.user.id);
  }

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

  @Get('/filtered/industry/:id')
  async getNewslettersByIndustry(@Param('id') industryId: string) {
    return this.newslettersService.getNewslettersByIndustry(industryId);
  }

  @Get('/filtered/interest/:id')
  async getNewslettersByInterest(@Param('id') interestId: string) {
    return this.newslettersService.getNewslettersByInterest(interestId);
  }
}
