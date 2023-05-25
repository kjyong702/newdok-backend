import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NewslettersService {
  constructor(private prisma: PrismaService) {}

  async getRecommendedNewsletters(industryId: string, interestIds: string[]) {
    const interestIdsOfNum = interestIds.map((id) => parseInt(id));

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

    const union = await this.prisma.newsletter.findMany({
      where: {
        OR: [
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

    return { intersection, union };
  }

  async getNewsletterById(id: string) {
    return this.prisma.newsletter.findUnique({
      where: { id: parseInt(id) },
      include: {
        industries: true,
        interests: true,
      },
    });
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
}
