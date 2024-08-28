import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser } from 'mailparser';
import Pop3Command from 'node-pop3';
import { parse } from 'node-html-parser';

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  // POP3 프로토콜 로직
  async POP3() {
    const allUser = await this.prisma.user.findMany({
      include: {
        _count: {
          select: { articles: true },
        },
      },
    });
    for (let i = 0; i < allUser.length; i++) {
      const user = allUser[i];
      const pop3 = new Pop3Command({
        user: user.subscribeEmail,
        password: user.subscribePassword,
        host: 'mail.newdok.site',
      });
      const emailList = await pop3.UIDL();
      const numOfArticles = user._count.articles;
      // 새롭게 수신한 POP3 이메일에 대해서만 파싱
      for (let i = numOfArticles + 1; i <= emailList.length; i++) {
        const rawEmail = await pop3.RETR(i);
        const parsedEmail = await simpleParser(rawEmail);
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
        // 아티클 수신 날짜 UTC to KST 변환
        const KR_TIME_DIFF = 9 * 60 * 60 * 1000;
        const utcDate = new Date(parsedEmail.date);
        const kstDate = new Date(utcDate.getTime() + KR_TIME_DIFF);
        const stringifyHTML = parsedEmail.html as string;

        // 아티클 생성
        const article = await this.prisma.article.create({
          data: {
            title: parsedEmail.subject,
            body: stringifyHTML
              .replace(/"/g, '"')
              .replace(/\n/g, '\n') as string,
            date: utcDate,
            publishYear: kstDate.getUTCFullYear(),
            publishMonth: kstDate.getUTCMonth() + 1,
            publishDate: kstDate.getUTCDate(),
            userId: user.id,
            newsletterId: newsletter.id,
          },
        });
        // 본문 미리보기 텍스트 추출 후, 아티클 업데이트
        const firstTwoBody = await this.extractTwoSentenceOfArticle(article.id);
        await this.prisma.article.update({
          where: {
            id: article.id,
          },
          data: {
            firstTwoBody,
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
        if (isSubscribed.status === 'PAUSED') {
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
  async extractTwoSentenceOfArticle(articleId: number) {
    const article = await this.prisma.article.findUnique({
      where: {
        id: articleId,
      },
      select: {
        id: true,
        body: true,
      },
    });

    const root = parse(article.body);

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
    const isBookmarked = await this.prisma.bookmark.findUnique({
      where: {
        userId_articleId: {
          userId,
          articleId: parseInt(articleId),
        },
      },
    });
    if (isBookmarked) {
      await this.prisma.bookmark.delete({
        where: {
          userId_articleId: {
            userId,
            articleId: parseInt(articleId),
          },
        },
      });
      await this.prisma.article.update({
        where: {
          id: parseInt(articleId),
        },
        data: {
          isBookmarked: false,
        },
      });
    } else {
      await this.prisma.bookmark.create({
        data: {
          userId,
          articleId: parseInt(articleId),
        },
      });
      await this.prisma.article.update({
        where: {
          id: parseInt(articleId),
        },
        data: {
          isBookmarked: true,
        },
      });
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
      article.newsletter.interests.forEach((interest) => {
        bookmarkedInterestIds.push({
          id: interest.id,
          name: interest.name,
        });
      });
    });
    await Promise.all(promises);

    // 관심사 id를 기준으로 중복 제거 후, 오름차순 정렬
    bookmarkedInterestIds = [
      ...new Map(
        bookmarkedInterestIds.map((interest) => [interest.id, interest]),
      ).values(),
    ].sort((a, b) => a.id - b.id);

    return bookmarkedInterestIds;
  }

  // 북마크한 아티클 조회
  async getBookmarkedArticles(interestId: string, userId: number) {
    let bookmarkedArticlesForInterest = [];

    const bookmark = await this.prisma.bookmark.findMany({
      where: {
        userId,
      },
      select: {
        article: {
          select: {
            id: true,
            title: true,
            firstTwoBody: true,
            date: true,
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
    bookmarkedArticlesForInterest = !interestId
      ? bookmark
      : (bookmarkedArticlesForInterest = bookmark.filter((data) => {
          return data.article.newsletter.interests.some(
            (interest) => interest.id === parseInt(interestId),
          );
        }));

    // 북마크 아티클 월별 그룹화
    const bookmarkedArticlesGroupedByMonth = {};

    for (const item of bookmarkedArticlesForInterest) {
      const date = new Date(item.article.date);
      const yearMonth = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
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
      });
    }

    // 월별 내림차순 정렬
    const bookmarkedArticlesGroupedByAndSorted = [];
    const sortedKeys = Object.keys(bookmarkedArticlesGroupedByMonth).sort(
      (a, b) => (a < b ? 1 : -1),
    );

    for (const key of sortedKeys) {
      const [year, month] = key.split('-');
      bookmarkedArticlesGroupedByAndSorted.push({
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
}
