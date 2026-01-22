import { Controller, Get } from '@nestjs/common';
import { OptionsService } from './options.service';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';

@ApiTags('Options')
@Controller('options')
export class OptionsController {
  constructor(private optionsService: OptionsService) {}

  @ApiOperation({
    summary: '옵션 데이터 조회',
    description:
      '프론트엔드에서 사용할 산업군, 관심사, 요일 목록을 조회합니다.',
  })
  @ApiOkResponse({
    description: '옵션 데이터 조회 성공',
    schema: {
      example: {
        industries: [
          { id: 1, name: '테크/IT' },
          { id: 2, name: '비즈니스/스타트업' },
        ],
        interests: [
          { id: 1, name: '개발' },
          { id: 2, name: '디자인' },
        ],
        days: [
          { id: 1, name: '월요일' },
          { id: 2, name: '화요일' },
        ],
      },
    },
  })
  @Get()
  async getAllOptions() {
    return this.optionsService.getAllOptions();
  }
}
