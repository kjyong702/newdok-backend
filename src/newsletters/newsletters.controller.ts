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

  @Get('')
  async getAllNewsletters(
    @Query('orderOpt') orderOpt: string,
    @Query('industry') industries: string[],
    @Query('day') days: string[],
  ) {
    return this.newslettersService.getAllNewsletters(
      orderOpt,
      industries,
      days,
    );
  }

  @Get('/filtered/industry/:id')
  async getNewslettersByIndustry(@Param('id') id: string) {
    return this.newslettersService.getNewslettersByIndustry(id);
  }

  @Get('/filtered/interest/:id')
  async getNewslettersByInterest(@Param('id') id: string) {
    return this.newslettersService.getNewslettersByInterest(id);
  }
}
