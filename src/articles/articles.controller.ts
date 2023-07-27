import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { AuthGuard } from '../guards/auth.guard';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

@ApiTags('Article')
@Controller('articles')
export class ArticlesController {
  constructor(private articlesService: ArticlesService) {}

  @ApiOperation({
    summary: 'POP3',
    description: '백엔드 자체 로직으로 end point에서 제외 예정입니다!',
  })
  @Post('/pop3')
  @UseGuards(AuthGuard)
  async POP3(@Req() req: any) {
    return this.articlesService.POP3ForUser(req.user.id);
  }

  @ApiQuery({
    name: 'publicationMonth',
    description: '아티클 수신 날짜(월)',
    example: 1,
  })
  @ApiOperation({ summary: '월별 아티클 조회' })
  @Get('')
  @UseGuards(AuthGuard)
  async getArticlesForMonth(
    @Query('publicationMonth') publicationMonth: string,
    @Req() req: any,
  ) {
    return this.articlesService.getArticlesForMonth(
      publicationMonth,
      req.user.id,
    );
  }

  @ApiParam({
    name: 'id',
    description: '아티클 id',
    example: 1,
  })
  @ApiOperation({ summary: '아티클 읽기' })
  @Get('/:id')
  async getArticleById(@Param('id') id: string) {
    return this.articlesService.getArticleById(id);
  }
}
