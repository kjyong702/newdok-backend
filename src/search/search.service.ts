import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { parse } from 'node-html-parser';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // 개선된 뉴스레터 검색 (띄어쓰기 무시 검색 지원)
  async searchNewsletters(brandName: string) {
    if (!brandName.trim()) {
      throw new BadRequestException('검색어가 없습니다');
    }

    // 브랜드명과 검색어 모두 띄어쓰기 제거 후 매칭 (대소문자 무시)
    const searchKeyword = brandName.replace(/\s+/g, '').toUpperCase();
    const searchedNewsletters = await this.prisma.$queryRaw<
      {
        id: number;
        brandName: string;
        firstDescription: string;
        imageUrl: string;
      }[]
    >`
      SELECT id, brandName, firstDescription, imageUrl 
      FROM Newsletter 
      WHERE UPPER(REPLACE(brandName, ' ', '')) LIKE ${`%${searchKeyword}%`}
    `;

    return searchedNewsletters;
  }

  async searchArticles(keyword: string) {
    if (!keyword.trim()) {
      throw new BadRequestException('검색어를 입력해주세요.');
    }

    // 임시: 개발 중 응답 반환
    return '아티클 검색 기능은 현재 개발 중입니다. 곧 제공될 예정입니다.';

    // TODO: 아래 로직을 개선하여 활성화 예정
    // // 핵심 개선: 하드코딩된 ID 제거, 검색어에 맞는 아티클 찾기
    // const article = await this.prisma.article.findFirst({
    //   where: {
    //     AND: [
    //       { isVisible: true },
    //       {
    //         OR: [
    //           {
    //             title: {
    //               contains: keyword.trim(),
    //             },
    //           },
    //           {
    //             plainBody: {
    //               contains: keyword.trim(),
    //             },
    //           },
    //         ],
    //       },
    //     ],
    //   },
    //   select: {
    //     id: true,
    //     plainBody: true,
    //   },
    //   orderBy: {
    //     date: 'desc',
    //   },
    // });

    // if (!article) {
    //   throw new BadRequestException('검색 결과가 없습니다.');
    // }

    // // TODO: 검색어와 일치하는 결과가 없는 경우, 예외 처리 필요
    // const matchedSentence = this.extractMatchedSentence(
    //   article.plainBody,
    //   keyword,
    // );

    // return matchedSentence?.trim() || '매칭되는 문장을 찾을 수 없습니다.';
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
