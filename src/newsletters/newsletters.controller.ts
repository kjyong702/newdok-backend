import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
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

  @Get('/filtered/industry/:id')
  async getNewslettersByIndustry(@Param('id') id: string) {
    return this.newslettersService.getNewslettersByIndustry(id);
  }

  @Get('/filtered/interest/:id')
  async getNewslettersByInterest(@Param('id') id: string) {
    return this.newslettersService.getNewslettersByInterest(id);
  }
}
