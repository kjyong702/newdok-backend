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

        await this.prisma.article.create({
          data: {
            title: parsedEmail.subject,
            body: stringifyHTML
              .replace(/"/g, '"')
              .replace(/\n/g, '\n') as string,
            date: utcDate,
            publishMonth: kstDate.getUTCMonth() + 1,
            publishDate: kstDate.getUTCDate(),
            userId: user.id,
            newsletterId: newsletter.id,
          },
        });
        // 수신한 아티클 뉴스레터 구독 여부 판단
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
        // 2. "구독 확인중" 뉴스레터인 경우
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
      }
      await pop3.QUIT();
    }
  }

  // 월 단위 수신 아티클 반환
  async getArticlesForMonth(publicationMonth: string, userId: number) {
    const articles = await this.prisma.article.findMany({
      where: {
        AND: [
          {
            userId,
          },
          {
            publishMonth: parseInt(publicationMonth),
          },
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

    const articlesForMonth = [];
    const articlesForDate = [];
    const numOfUnReadArticlesForDate = [];

    for (let i = 0; i < 31; i++) {
      articlesForDate[i] = [];
      numOfUnReadArticlesForDate[i] = 0;
    }
    articles.forEach((article) => {
      articlesForDate[article.publishDate - 1].push({
        brandName: article.newsletter.brandName,
        imageUrl: article.newsletter.imageUrl,
        articleTitle: article.title,
        articleId: article.id,
        status: article.status,
      });
      if (article.status === 'Unread')
        numOfUnReadArticlesForDate[article.publishDate - 1]++;
    });
    for (let i = 0; i < 31; i++) {
      articlesForMonth.push({
        publishDate: i + 1,
        receivedUnread: numOfUnReadArticlesForDate[i],
        receivedArticleList: articlesForDate[i],
      });
    }

    return articlesForMonth;
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

  // 아티클 미리보기용 본문 추출
  async extractTwoSentenceOfArticle(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        id: parseInt(articleId),
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
      : filteredElements[0].text;
  }
}
