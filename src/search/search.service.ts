import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { parse } from 'node-html-parser';

// 인기 검색어 상수 (임시 데이터)
// TODO: 추후 검색어 count 기반으로 동적 조회하도록 변경 예정
const POPULAR_SEARCH_KEYWORDS = [
  'NEWNEEK',
  'Daily Byte',
  '뉴닉',
  '테크',
  '비즈니스',
];

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // 개선된 뉴스레터 검색 (띄어쓰기 무시 검색 지원 + 산업군/관심사 태그 검색)
  async searchNewsletters(brandName: string) {
    if (!brandName.trim()) {
      throw new BadRequestException('검색어가 없습니다');
    }

    const searchKeyword = brandName.replace(/\s+/g, '').toUpperCase();

    // 1. 브랜드명 매칭
    const byBrandName = await this.prisma.$queryRaw<
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

    // 2. 산업군/관심사 태그명 매칭
    const trimmedKeyword = brandName.trim();
    const byTag = await this.prisma.newsletter.findMany({
      where: {
        OR: [
          { industries: { some: { name: { contains: trimmedKeyword } } } },
          { interests: { some: { name: { contains: trimmedKeyword } } } },
        ],
        temporaryMiss: false,
      },
      select: {
        id: true,
        brandName: true,
        firstDescription: true,
        imageUrl: true,
      },
    });

    // 3. 중복 제거 후 합치기 (브랜드명 매칭 우선)
    const resultMap = new Map<number, (typeof byBrandName)[0]>();
    for (const item of byBrandName) {
      resultMap.set(item.id, item);
    }
    for (const item of byTag) {
      if (!resultMap.has(item.id)) {
        resultMap.set(item.id, item);
      }
    }

    return [...resultMap.values()];
  }

  /**
   * 인기 검색어 조회
   * 현재는 고정된 검색어 5개를 반환합니다.
   * TODO: 추후 검색어 count 기반으로 상위 5개 동적 조회하도록 변경 예정
   */
  async getPopularSearchKeywords() {
    // TODO: 추후 자동 갱신 로직 추가 시 실제 업데이트 날짜로 변경 예정
    const updatedDate = new Date();
    const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
    const day = String(updatedDate.getDate()).padStart(2, '0');
    const formattedDate = `${month}.${day}`;

    return {
      updatedDate: formattedDate,
      keywords: POPULAR_SEARCH_KEYWORDS.map((keyword, index) => ({
        rank: index + 1,
        keyword,
      })),
    };
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
