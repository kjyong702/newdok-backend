import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser } from 'mailparser';
import Pop3Command from 'node-pop3';
import { parse } from 'node-html-parser';

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  // POP3 작업 동시 실행 방지 플래그
  private isPop3Running = false;

  // POP3 프로토콜 로직
  async POP3() {
    // 이미 POP3 작업이 실행 중이면 새 요청은 무시
    if (this.isPop3Running) {
      console.log('[POP3] 작업이 이미 실행 중이어서 새 요청을 건너뜁니다.');
      return { message: 'POP3 작업이 이미 실행 중입니다.' };
    }

    this.isPop3Running = true;
    try {
      const allUser = await this.prisma.user.findMany({
        include: {
          _count: {
            select: { articles: true },
          },
        },
      });

      // 유저 단위 병렬 처리 (배치 병렬 처리로 전체 속도 개선)
      const CONCURRENCY = 3; // 동시에 처리할 유저 수 (필요하면 환경변수로 분리 가능)

      const processUser = async (user: any) => {
        // iwinv 웹메일 서비스 개편으로 POP3S(TLS) 연결 사용
        const pop3 = new Pop3Command({
          user: user.subscribeEmail,
          password: user.subscribePassword,
          host: 'mail.newdok.store',
          port: 995,
          tls: true,
        });

        const emailList = await pop3.UIDL();
        const numOfArticles = user._count.articles;

        // 새롭게 수신한 POP3 이메일에 대해서만 파싱
        for (let i = numOfArticles + 1; i <= emailList.length; i++) {
          const rawEmail = await pop3.RETR(i);
          const parsedEmail = await simpleParser(rawEmail);

          // 디버깅: 이메일 헤더 정보 출력
          console.log('=== 이메일 헤더 디버깅 ===');
          console.log('From:', parsedEmail.from);
          console.log('Reply-To:', parsedEmail.replyTo);
          console.log('Return-Path:', parsedEmail.headers.get('return-path'));
          console.log('Sender:', parsedEmail.headers.get('sender'));
          console.log('Subject:', parsedEmail.subject);
          console.log('========================');

          const { address } = parsedEmail.from.value[0];
          // 최대 3회까지 뉴스레터 브랜드 존재 여부 검사
          let newsletter = await this.prisma.newsletter.findUnique({
            where: {
              brandEmail: address,
            },
          });
          if (!newsletter) {
            newsletter = await this.prisma.newsletter.findUnique({
              where: {
                secondEmail: address,
              },
            });
          }
          if (!newsletter) {
            newsletter = await this.prisma.newsletter.findUnique({
              where: {
                thirdEmail: address,
              },
            });
          }

          // 뉴스레터 브랜드를 찾을 수 없는 경우 에러 발생
          if (!newsletter) {
            throw new Error(`알 수 없는 뉴스레터 발신자: ${address}`);
          }

          // 아티클 수신 날짜 UTC to KST 변환
          const KR_TIME_DIFF = 9 * 60 * 60 * 1000;
          const utcDate = new Date(parsedEmail.date);
          const kstDate = new Date(utcDate.getTime() + KR_TIME_DIFF);

          // HTML 본문 처리 (기존 로직 + null 체크만 추가)
          const stringifyHTML = (parsedEmail.html ||
            parsedEmail.text ||
            '') as string;

          // 본문 미리보기 텍스트 생성
          const firstTwoBody = await this.extractTwoSentenceOfArticle(
            stringifyHTML,
          );
          // 아티클 본문에서 순수 텍스트 추출
          const plainBody = stringifyHTML
            .replace(/<style[^>]*>@media[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // 아티클 생성
          const article = await this.prisma.article.create({
            data: {
              title: parsedEmail.subject || '제목 없음',
              body: stringifyHTML
                .replace(/"/g, '"')
                .replace(/\n/g, '\n') as string,
              firstTwoBody: firstTwoBody || '',
              plainBody,
              date: utcDate,
              publishYear: kstDate.getUTCFullYear(),
              publishMonth: kstDate.getUTCMonth() + 1,
              publishDate: kstDate.getUTCDate(),
              userId: user.id,
              newsletterId: newsletter.id,
            },
          });

          // 수신한 아티클 뉴스레터 구독 상태에 따른 처리
          const isSubscribed = await this.prisma.newslettersOnUsers.findUnique({
            where: {
              userId_newsletterId: {
                userId: user.id,
                newsletterId: newsletter.id,
              },
            },
          });
          // 1. "구독 전" 뉴스레터인 경우
          if (!isSubscribed) {
            await this.prisma.newslettersOnUsers.create({
              data: {
                userId: user.id,
                newsletterId: newsletter.id,
                status: newsletter.doubleCheck === true ? 'CHECK' : 'CONFIRMED',
              },
            });
          }
          // 2. "구독 확인 중" 뉴스레터인 경우
          if (isSubscribed && isSubscribed.status === 'CHECK') {
            await this.prisma.newslettersOnUsers.update({
              where: {
                userId_newsletterId: {
                  userId: user.id,
                  newsletterId: newsletter.id,
                },
              },
              data: {
                status: 'CONFIRMED',
              },
            });
          }
          // 3. "구독 중지 중" 뉴스레터인 경우
          if (isSubscribed && isSubscribed.status === 'PAUSED') {
            await this.prisma.article.update({
              where: {
                id: article.id,
              },
              data: {
                isVisible: false,
              },
            });
          }
        }

        await pop3.QUIT();
      };

      // 배치 단위로 유저를 병렬 처리
      for (let i = 0; i < allUser.length; i += CONCURRENCY) {
        const batch = allUser.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map((user) => processUser(user)));
      }

      return { message: 'POP3 작업이 완료되었습니다.' };
    } finally {
      this.isPop3Running = false;
    }
  }

  // 날짜별 아티클 조회
  async getArticlesByDate(
    year: string,
    publicationMonth: string,
    userId: number,
  ) {
    const articles = await this.prisma.article.findMany({
      where: {
        AND: [
          { isVisible: true },
          { publishYear: parseInt(year) },
          { publishMonth: parseInt(publicationMonth) },
          { userId },
        ],
      },
      select: {
        id: true,
        title: true,
        publishDate: true,
        status: true,
        newsletter: {
          select: {
            brandName: true,
            imageUrl: true,
          },
        },
      },
    });

    // 날짜별 아티클 그룹화
    const articlesGroupedByDate = Array(31)
      .fill(null)
      .map(() => ({
        receivedUnread: 0,
        receivedArticleList: [],
      }));

    articles.forEach((article) => {
      articlesGroupedByDate[article.publishDate - 1].receivedArticleList.push({
        brandName: article.newsletter.brandName,
        imageUrl: article.newsletter.imageUrl,
        articleTitle: article.title,
        articleId: article.id,
        status: article.status,
      });
      if (article.status === 'Unread')
        articlesGroupedByDate[article.publishDate - 1].receivedUnread++;
    });

    return {
      data: articlesGroupedByDate.map((data, index) => {
        return {
          publishDate: index + 1,
          receivedUnread: data.receivedUnread,
          receivedArticleList: data.receivedArticleList,
        };
      }),
    };
  }

  // 오늘 날짜 아티클 조회
  async getTodayArticles(userId: number) {
    const todayDate = new Date();

    const todayArticles = await this.prisma.article.findMany({
      where: {
        AND: [
          { isVisible: true },
          { publishYear: todayDate.getFullYear() },
          { publishMonth: todayDate.getMonth() + 1 },
          { publishDate: todayDate.getDate() },
          { userId },
        ],
      },
      select: {
        id: true,
        title: true,
        publishDate: true,
        status: true,
        newsletter: {
          select: {
            brandName: true,
            imageUrl: true,
          },
        },
      },
    });

    return todayArticles;
  }

  // 아티클 읽기
  async getArticleById(articleId: string) {
    const article = await this.prisma.article.update({
      where: {
        id: parseInt(articleId),
      },
      data: {
        status: 'Read',
      },
      include: { newsletter: true },
    });

    const data = {
      articleTitle: article.title,
      articleid: article.id,
      date: article.date,
      brandId: article.newsletter.id,
      brandName: article.newsletter.brandName,
      articleHTML: article.body,
      brandImageUrl: article.newsletter.imageUrl,
      isBookmarked: article.isBookmarked,
    };
    return data;
  }

  // 아티클 삭제
  async deleteArticleById(articleId: string) {
    const deletedArticle = await this.prisma.article.delete({
      where: {
        id: parseInt(articleId),
      },
    });

    return deletedArticle;
  }

  // 아티클 전체 삭제
  async deleteArticles() {
    const deletedArticles = await this.prisma.article.deleteMany();

    return deletedArticles;
  }

  // 유저의 총 수신 아티클 개수
  async calNumOfReceivedArticles(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        _count: {
          select: { articles: true },
        },
      },
    });

    return user._count.articles;
  }

  // 아티클 미리보기 본문 추출
  async extractTwoSentenceOfArticle(articleBody: string) {
    const root = parse(articleBody);

    const selectedElements = root.querySelectorAll(
      '.stb-fore-colored, .stb-bold',
    );
    const elements =
      selectedElements.length === 0
        ? root.getElementsByTagName('*')
        : selectedElements;

    const filteredElements = elements.filter((element) => {
      const style = element.getAttribute('style');
      const hasColorStyle = style && style.includes('color');
      const isBlackText = style && style.includes('color: #000000;');

      const hasHref = element.getAttribute('href');

      const isValidText =
        /[가-힣]/.test(element.text) && element.text.length > 10;

      return !hasHref && (!hasColorStyle || isBlackText) && isValidText;
    });

    return filteredElements.length > 2
      ? filteredElements[1].text + ' ' + filteredElements[2].text
      : filteredElements[0]?.text;
  }

  // 아티클 북마크 요청 및 취소
  async bookmarkArticle(articleId: string, userId: number) {
    const parsedArticleId = parseInt(articleId);

    // 1. 아티클 존재 여부 및 소유자 확인
    const article = await this.prisma.article.findUnique({
      where: {
        id: parsedArticleId,
      },
      select: {
        id: true,
        userId: true,
        title: true,
      },
    });

    if (!article) {
      throw new NotFoundException('존재하지 않는 아티클입니다.');
    }

    if (article.userId !== userId) {
      throw new BadRequestException(
        '본인이 수신받은 아티클만 북마크할 수 있습니다.',
      );
    }

    // 2. 현재 북마크 상태 확인
    const isBookmarked = await this.prisma.bookmark.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId: parsedArticleId,
        },
      },
    });

    // 3. 북마크 추가/삭제 처리
    if (isBookmarked) {
      // 북마크 삭제
      await this.prisma.bookmark.delete({
        where: {
          userId_articleId: {
            userId,
            articleId: parsedArticleId,
          },
        },
      });
      await this.prisma.article.update({
        where: {
          id: parsedArticleId,
        },
        data: {
          isBookmarked: false,
        },
      });

      return {
        success: true,
        action: 'removed',
        message: '북마크가 취소되었습니다.',
        data: {
          articleId: parsedArticleId,
          articleTitle: article.title,
          isBookmarked: false,
        },
      };
    } else {
      // 북마크 추가
      await this.prisma.bookmark.create({
        data: {
          userId,
          articleId: parsedArticleId,
        },
      });
      await this.prisma.article.update({
        where: {
          id: parsedArticleId,
        },
        data: {
          isBookmarked: true,
        },
      });

      return {
        success: true,
        action: 'added',
        message: '북마크가 추가되었습니다.',
        data: {
          articleId: parsedArticleId,
          articleTitle: article.title,
          isBookmarked: true,
        },
      };
    }
  }

  // 북마크한 아티클 관심사 조회
  async getUserBookmarkedInterests(userId: number) {
    let bookmarkedInterestIds = [];

    const bookmarks = await this.prisma.bookmark.findMany({
      where: {
        userId,
      },
    });
    const bookmarkedArticleIds = bookmarks.map((bookmark) => {
      return bookmark.articleId;
    });

    const promises = bookmarkedArticleIds.map(async (articleId) => {
      const article = await this.prisma.article.findUnique({
        where: {
          id: articleId,
        },
        select: {
          id: true,
          newsletter: {
            select: {
              interests: {
                orderBy: {
                  id: 'asc',
                },
              },
            },
          },
        },
      });

      // null 체크 추가
      if (article && article.newsletter && article.newsletter.interests) {
        article.newsletter.interests.forEach((interest) => {
          bookmarkedInterestIds.push({
            id: interest.id,
            name: interest.name,
          });
        });
      }
    });
    await Promise.all(promises);

    // 관심사 id를 기준으로 중복 제거 후, 오름차순 정렬
    bookmarkedInterestIds = [
      ...new Map(
        bookmarkedInterestIds.map((interest) => [interest.id, interest]),
      ).values(),
    ].sort((a, b) => a.id - b.id);

    return { data: bookmarkedInterestIds };
  }

  // 북마크한 아티클 조회
  async getBookmarkedArticles(
    interestId: string,
    sortBy: string,
    userId: number,
  ) {
    let bookmarkedArticlesForInterest = [];

    // 정렬 기준 기본값 설정
    const sortBy_default = sortBy || 'bookmark_date'; // 기본값: 북마크 추가순
    const useBookmarkDateForGrouping = sortBy_default === 'bookmark_date'; // 북마크 추가일 기준 여부

    const bookmark = await this.prisma.bookmark.findMany({
      where: {
        userId,
      },
      select: {
        createdAt: true, // 북마크 추가 시점
        article: {
          select: {
            id: true,
            title: true,
            firstTwoBody: true,
            date: true, // 아티클 수신 시점
            newsletter: {
              select: {
                id: true,
                brandName: true,
                imageUrl: true,
                interests: {
                  select: {
                    id: true,
                  },
                  orderBy: {
                    id: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });

    // 선택된 관심사 id가 있으면 필터링, 없으면 전체 선택
    bookmarkedArticlesForInterest =
      !interestId || interestId.trim() === ''
        ? bookmark
        : (bookmarkedArticlesForInterest = bookmark.filter((data) => {
            return data.article.newsletter.interests.some(
              (interest) => interest.id === parseInt(interestId),
            );
          }));

    // 북마크 아티클 월별 그룹화
    const bookmarkedArticlesGroupedByMonth = {};

    for (const item of bookmarkedArticlesForInterest) {
      // 정렬 기준에 따라 년/월 분류 기준 날짜 결정
      const groupingDate = useBookmarkDateForGrouping
        ? new Date(item.createdAt) // 북마크 추가일 기준
        : new Date(item.article.date); // 아티클 수신일 기준

      const yearMonth = `${groupingDate.getFullYear()}-${String(
        groupingDate.getMonth() + 1,
      ).padStart(2, '0')}`;

      if (!bookmarkedArticlesGroupedByMonth[yearMonth]) {
        bookmarkedArticlesGroupedByMonth[yearMonth] = [];
      }
      bookmarkedArticlesGroupedByMonth[yearMonth].push({
        brandName: item.article.newsletter.brandName,
        brandId: item.article.newsletter.id,
        articleTitle: item.article.title,
        articleId: item.article.id,
        sampleText: item.article.firstTwoBody,
        date: item.article.date,
        imageURL: item.article.newsletter.imageUrl,
        bookmarkCreatedAt: item.createdAt, // 정렬용 북마크 추가 시점
        articleDate: item.article.date, // 정렬용 아티클 수신 시점
      });
    }

    // 각 월 내에서 정렬 기준 적용
    Object.keys(bookmarkedArticlesGroupedByMonth).forEach((yearMonth) => {
      const articles = bookmarkedArticlesGroupedByMonth[yearMonth];

      switch (sortBy_default) {
        case 'article_date_desc': // 최신 아티클순
          articles.sort(
            (a, b) =>
              new Date(b.articleDate).getTime() -
              new Date(a.articleDate).getTime(),
          );
          break;
        case 'article_date_asc': // 오래된 아티클순
          articles.sort(
            (a, b) =>
              new Date(a.articleDate).getTime() -
              new Date(b.articleDate).getTime(),
          );
          break;
        case 'bookmark_date': // 북마크 추가순 (기본값)
        default:
          articles.sort(
            (a, b) =>
              new Date(b.bookmarkCreatedAt).getTime() -
              new Date(a.bookmarkCreatedAt).getTime(),
          );
          break;
      }

      // 정렬용 필드 제거 (프론트에 불필요한 데이터 제거)
      articles.forEach((article) => {
        delete article.bookmarkCreatedAt;
        delete article.articleDate;
      });
    });

    // 월별 내림차순 정렬
    const bookmarkedArticlesGroupedByAndSorted = [];
    const sortedKeys = Object.keys(bookmarkedArticlesGroupedByMonth).sort(
      (a, b) => (a < b ? 1 : -1),
    );

    for (let i = 0; i < sortedKeys.length; i++) {
      const key = sortedKeys[i];
      const [year, month] = key.split('-');
      bookmarkedArticlesGroupedByAndSorted.push({
        id: i + 1,
        month: `${year}년 ${month}월`,
        bookmark: bookmarkedArticlesGroupedByMonth[key],
      });
    }

    return {
      data: {
        totalAmount: bookmarkedArticlesForInterest.length,
        bookmarkForMonth: bookmarkedArticlesGroupedByAndSorted,
      },
    };
  }

  async getUserReceivedArticleCount(userId: number) {
    const count = await this.prisma.article.count({
      where: {
        userId,
      },
    });

    return { count };
  }
}
