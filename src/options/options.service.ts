import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SUBSCRIPTION_STATUS } from '../newsletters/constants/subscription-status';

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
      { status: SUBSCRIPTION_STATUS.INITIAL, description: '구독 전' },
      { status: SUBSCRIPTION_STATUS.CHECK, description: '구독 확인 중' },
      { status: SUBSCRIPTION_STATUS.CONFIRMED, description: '구독 완료' },
      { status: SUBSCRIPTION_STATUS.PAUSED, description: '구독 중지' },
    ];

    return {
      industries,
      interests,
      days,
      subscriptionStatuses,
    };
  }
}
