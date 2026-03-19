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

    const subscriptionStatuses = [
      { status: 'INITIAL', description: '구독 전' },
      { status: 'CHECK', description: '구독 확인 중' },
      { status: 'CONFIRMED', description: '구독 완료' },
      { status: 'PAUSED', description: '구독 중지' },
    ];

    return {
      industries,
      interests,
      days,
      subscriptionStatuses,
    };
  }
}
