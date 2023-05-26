import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NewslettersService {
  constructor(private prisma: PrismaService) {}

  async getRecommendedNewsletters(industryId: string, interestIds: string[]) {
    let interestIdsOfNum = [];

    if (typeof interestIds === 'string') {
      interestIdsOfNum.push(parseInt(interestIds));
    } else {
      interestIdsOfNum = interestIds.map((id) => parseInt(id));
    }

    const intersection = await this.prisma.newsletter.findMany({
      where: {
        AND: [
          {
            industries: {
              some: {
                id: parseInt(industryId),
              },
            },
            interests: {
              some: {
                id: { in: interestIdsOfNum },
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

    const union1 = await this.prisma.newsletter.findMany({
      where: {
        industries: {
          some: {
            id: parseInt(industryId),
          },
        },
      },
    });
    const ids1 = union1.map((newsletter) => newsletter.id);

    const union2 = await this.prisma.newsletter.findMany({
      where: {
        interests: {
          some: {
            id: { in: interestIdsOfNum },
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

    return { intersection, union };
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
