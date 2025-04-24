import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { parse } from 'node-html-parser';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async searchNewsletters(brandName: string) {
    if (!brandName.trim()) {
      throw new BadRequestException('검색어가 없습니다');
    }
    const searchedNewsletters = await this.prisma.newsletter.findMany({
      where: {
        OR: [
          {
            brandName: {
              contains: brandName.trim(),
            },
          },
          {
            brandName: {
              contains: brandName.replace(/\s+/g, ''),
            },
          },
        ],
      },
      select: {
        id: true,
        brandName: true,
        firstDescription: true,
        imageUrl: true,
      },
    });

    return searchedNewsletters;
  }

  async searchArticles(keyword: string) {
    if (!keyword.trim()) {
      throw new BadRequestException('검색어를 입력해주세요.');
    }

    const article = await this.prisma.article.findUnique({
      where: {
        id: 89930,
      },
      select: {
        id: true,
        body: true,
      },
    });

    const plainBody = this.stripHtml(article.body);
    // TODO: 검색어와 일치하는 결과가 없는 경우, 예외 처리 필요
    const matchedSentence = this.extractMatchedSentence(plainBody, keyword);

    return matchedSentence.trim();
  }

  private stripHtml(html: string): string {
    const root = parse(html);

    let textContent = root.textContent || '';

    textContent = textContent.replace(/\s+/g, ' ').trim();

    return textContent;
  }

  private extractMatchedSentence(text: string, keyword: string): string {
    const sentences = text.split(/(?<=[.?!])\s+/);

    const matchedSentence = sentences.find((sentence) =>
      sentence.includes(keyword),
    );

    return matchedSentence;
  }
}
