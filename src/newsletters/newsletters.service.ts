import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NewslettersService {
  constructor(private prisma: PrismaService) {}

  async getRecommendedNewsletters(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        interests: true,
      },
    });

    const interestIds = user.interests.map((data) => data.interestId);
    if (interestIds.length === 0) {
      throw new BadRequestException('사전조사 미실시 유저입니다');
    }

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
        NOT: {
          users: {
            some: { userId },
          },
        },
      },
      select: {
        id: true,
        brandName: true,
        firstDescription: true,
        secondDescription: true,
        publicationCycle: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        interests: true,
      },
    });

    const union1 = await this.prisma.newsletter.findMany({
      where: {
        industries: {
          some: {
            id: user.industryId,
          },
        },
        NOT: {
          users: {
            some: { userId },
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
        NOT: {
          users: {
            some: { userId },
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
      select: {
        id: true,
        brandName: true,
        firstDescription: true,
        secondDescription: true,
        publicationCycle: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
        interests: true,
      },
    });

    const data = {
      intersection,
      union,
    };

    return data;
  }

  async getNewsletterById(brandId: string, userId: number) {
    const newsletter = await this.prisma.newsletter.findUnique({
      where: {
        id: parseInt(brandId),
      },
      include: {
        articles: {
          take: 5,
          distinct: ['title'],
          select: {
            id: true,
            title: true,
            date: true,
          },
        },
        interests: true,
      },
    });
    const isSubscribed = await this.prisma.newslettersOnUsers.findUnique({
      where: {
        userId_newsletterId: {
          userId,
          newsletterId: parseInt(brandId),
        },
      },
    });

    const data = {
      brandId: newsletter.id,
      brandName: newsletter.brandName,
      detailDescription: newsletter.detailDescription,
      interests: newsletter.interests,
      publicationCycle: newsletter.publicationCycle,
      imageUrl: newsletter.imageUrl,
      brandArticleList: newsletter.articles,
      isSubscribed: isSubscribed ? 'CONFIRMED' : 'INITIAL',
      subscribeCheck: newsletter.doubleCheck,
    };

    return data;
  }

  async getAllNewsletters(
    orderOpt: string,
    industries: string[],
    days: string[],
    userId: number,
  ) {
    const industryIds = industries.map((industryId) => parseInt(industryId));
    const dayIds = days.map((dayId) => parseInt(dayId));

    // 1. 인기순 정렬 + 구독 중인 뉴스레터
    if (orderOpt === '인기순') {
      const arr1 = await this.prisma.newsletter.findMany({
        where: {
          AND: [
            {
              industries: {
                some: { id: { in: industryIds } },
              },
            },
            {
              days: {
                some: { id: { in: dayIds } },
              },
            },
            {
              users: {
                some: { userId },
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
          interests: true,
        },
      });

      const newslettersSubscribed = [];
      arr1.forEach((newsletter) => {
        newslettersSubscribed.push({
          brandId: newsletter.id,
          brandName: newsletter.brandName,
          imageUrl: newsletter.imageUrl,
          interest: newsletter.interests,
          isSubscribed: 'CONFIRMED',
          shortDescription: newsletter.secondDescription,
        });
      });
      // 2. 인기순 정렬 + 구독 중이 아닌 뉴스레터
      const arr2 = await this.prisma.newsletter.findMany({
        where: {
          AND: [
            {
              industries: {
                some: { id: { in: industryIds } },
              },
            },
            {
              days: {
                some: { id: { in: dayIds } },
              },
            },
          ],
          NOT: {
            users: {
              some: { userId },
            },
          },
        },
        orderBy: {
          users: {
            _count: 'desc',
          },
        },
        include: {
          interests: true,
        },
      });

      const newslettersUnSubscribed = [];
      arr2.forEach((newsletter) => {
        newslettersUnSubscribed.push({
          brandId: newsletter.id,
          brandName: newsletter.brandName,
          imageUrl: newsletter.imageUrl,
          interest: newsletter.interests,
          isSubscribed: 'INITIAL',
          shortDescription: newsletter.secondDescription,
        });
      });

      return newslettersSubscribed.concat(newslettersUnSubscribed);
    } else {
      // 3. 최신순 정렬 + 구독 중인 뉴스레터
      const arr1 = await this.prisma.newsletter.findMany({
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
            {
              users: {
                some: { userId },
              },
            },
          ],
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          interests: true,
        },
      });

      const newslettersSubscribed = [];
      arr1.forEach((newsletter) => {
        newslettersSubscribed.push({
          brandId: newsletter.id,
          brandName: newsletter.brandName,
          imageUrl: newsletter.imageUrl,
          interest: newsletter.interests,
          isSubscribed: 'CONFIRMED',
          shortDescription: newsletter.secondDescription,
        });
      });

      // 4. 최신순 정렬 + 구독 중이 아닌 뉴스레터
      const arr2 = await this.prisma.newsletter.findMany({
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
          NOT: {
            users: {
              some: { userId },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          interests: true,
        },
      });

      const newslettersUnSubscribed = [];
      arr2.forEach((newsletter) => {
        newslettersUnSubscribed.push({
          brandId: newsletter.id,
          brandName: newsletter.brandName,
          imageUrl: newsletter.imageUrl,
          interest: newsletter.interests,
          isSubscribed: 'INITIAL',
          shortDescription: newsletter.secondDescription,
        });
      });

      return newslettersSubscribed.concat(newslettersUnSubscribed);
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
