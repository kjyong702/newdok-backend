import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NewslettersService {
  constructor(private prisma: PrismaService) {}

  async getRecommendedNewsletters(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { interests: true },
    });

    const isSubscribedForIntersection = [];
    const isSubscribedForUnion = [];

    const subscribedNewsletters = await this.prisma.newslettersOnUsers.findMany(
      {
        where: { userId },
      },
    );

    const subscribedNewsletterIds = [];
    subscribedNewsletters.forEach((value: any) =>
      subscribedNewsletterIds.push(value.newsletterId),
    );

    const interestIds = user.interests.map((data) => data.interestId);

    const intersection = await this.prisma.newsletter.findMany({
      where: {
        AND: [
          {
            industries: {
              some: {
                id: user.industryId,
              },
            },
            interests: {
              some: {
                id: { in: interestIds },
              },
            },
          },
        ],
      },
      include: {
        industries: true,
        interests: true,
      },
    });
    intersection.forEach((value: any) => {
      if (!subscribedNewsletterIds.includes(value.id)) {
        isSubscribedForIntersection.push(
          Object.assign(value, { isSubscribed: '구독 전' }),
        );
      }
    });

    const union1 = await this.prisma.newsletter.findMany({
      where: {
        industries: {
          some: {
            id: user.industryId,
          },
        },
      },
    });
    const ids1 = union1.map((newsletter) => newsletter.id);

    const union2 = await this.prisma.newsletter.findMany({
      where: {
        interests: {
          some: {
            id: { in: interestIds },
          },
        },
      },
    });
    const ids2 = union2.map((newsletter) => newsletter.id);

    const unionIds = ids1.concat(ids2);
    const set = new Set(unionIds);
    const uniqueUnionIds = [...set];

    const union = await this.prisma.newsletter.findMany({
      where: {
        id: { in: uniqueUnionIds },
      },
      include: {
        industries: true,
        interests: true,
      },
    });
    union.forEach((value: any) => {
      if (!subscribedNewsletterIds.includes(value.id)) {
        isSubscribedForUnion.push(
          Object.assign(value, { isSubscribed: '구독 전' }),
        );
      }
    });

    return {
      intersection: isSubscribedForIntersection,
      union: isSubscribedForUnion,
    };
  }

  async getAllNewsletters(
    orderOpt: string,
    industries: string[],
    days: string[],
  ) {
    const industryIds = industries.map((industryId) => parseInt(industryId));
    const dayIds = days.map((dayId) => parseInt(dayId));

    if (orderOpt === '인기순') {
      const newsletters = await this.prisma.newsletter.findMany({
        where: {
          AND: [
            {
              industries: {
                some: {
                  id: { in: industryIds },
                },
              },
            },
            {
              days: {
                some: {
                  id: { in: dayIds },
                },
              },
            },
          ],
        },
        orderBy: {
          users: {
            _count: 'desc',
          },
        },
        include: {
          industries: true,
          interests: true,
          days: true,
        },
      });
      return newsletters;
    } else {
      const newsletters = await this.prisma.newsletter.findMany({
        where: {
          AND: [
            {
              industries: {
                some: {
                  id: { in: industryIds },
                },
              },
            },
            {
              days: {
                some: {
                  id: { in: dayIds },
                },
              },
            },
          ],
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          industries: true,
          interests: true,
          days: true,
        },
      });
      return newsletters;
    }
  }

  async getNewslettersByIndustry(id: string) {
    return this.prisma.newsletter.findMany({
      where: {
        industries: {
          some: {
            id: parseInt(id),
          },
        },
      },
      include: {
        industries: true,
        interests: true,
      },
    });
  }

  async getNewslettersByInterest(id: string) {
    return this.prisma.newsletter.findMany({
      where: {
        interests: {
          some: {
            id: parseInt(id),
          },
        },
      },
      include: {
        industries: true,
        interests: true,
      },
    });
  }
}
