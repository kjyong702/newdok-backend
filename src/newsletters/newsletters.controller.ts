import { Controller, Get, Param, Query } from '@nestjs/common';
import { NewslettersService } from './newsletters.service';

@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @Get()
  async getRecommendedNewsletters(@Query() query: any) {
    return this.newslettersService.getRecommendedNewsletters(
      query.industry,
      query.interest,
    );
  }

  @Get('/filtered/industry/:id')
  async getNewslettersByIndustry(@Param('id') id: string) {
    return this.newslettersService.getNewslettersByIndustry(id);
  }

  @Get('/:id')
  async getNewsletterById(@Param('id') id: string) {
    return this.newslettersService.getNewsletterById(id);
  }
}
