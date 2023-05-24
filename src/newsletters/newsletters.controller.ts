import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { NewslettersService } from './newsletters.service';

@Controller('newsletters')
export class NewslettersController {
  constructor(private newslettersService: NewslettersService) {}

  @Post()
  async createNewsletter(@Body() body: any) {
    return this.newslettersService.create(body);
  }

  @Get('/:id')
  async getNewsletterById(@Param('id') id: string) {
    return this.newslettersService.findOne(id);
  }

  @Get()
  async getAllNewsletters() {
    return this.newslettersService.findAll();
  }

  @Delete('/:id')
  async deleteNewletterById(@Param('id') id: string) {
    return this.newslettersService.deleteOne(id);
  }
}
