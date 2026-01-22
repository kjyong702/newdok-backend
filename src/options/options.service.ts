import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class OptionsService {
  constructor(private prisma: PrismaService) {}

  async getAllOptions() {
    const [industries, interests, days] = await Promise.all([
      this.prisma.industry.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.interest.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.day.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return {
      industries,
      interests,
      days,
    };
  }
}
