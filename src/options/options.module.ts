import { Module } from '@nestjs/common';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [OptionsController],
  providers: [OptionsService, PrismaService],
})
export class OptionsModule {}
