import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser } from 'mailparser';
import { Cron, CronExpression } from '@nestjs/schedule';
const Pop3Command = require('node-pop3');

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  // POP3 프로토콜 로직
  @Cron(CronExpression.EVERY_30_MINUTES)
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
      // '새롭게' 수신된 POP3 이메일에 대해서만 파싱
      for (let i = numOfArticles + 1; i <= emailList.length; i++) {
        const rawEmail = await pop3.RETR(i);
        const parsedEmail = await simpleParser(rawEmail);
        const { address } = parsedEmail.from.value[0];
        let newsletter = await this.prisma.newsletter.findUnique({
          where: {
            brandEmail: address,
          },
        });
        // 구독 확인 아티클을 수신한 경우, secondEmail에 접근
        if (!newsletter) {
          newsletter = await this.prisma.newsletter.findUnique({
            where: {
              secondEmail: address,
            },
          });
        }
        const stringifyHTML = parsedEmail.html as string;
        await this.prisma.article.create({
          data: {
            title: parsedEmail.subject,
            body: stringifyHTML
              .replace(/"/g, '"')
              .replace(/\n/g, '\n') as string,
            date: parsedEmail.date,
            publishMonth: new Date(parsedEmail.date).getMonth() + 1,
            publishDate: new Date(parsedEmail.date).getDate(),
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

    for (let i = 0; i < 31; i++) {
      articlesForDate[i] = [];
    }
    articles.forEach((article) => {
      articlesForDate[article.publishDate - 1].push({
        brandName: article.newsletter.brandName,
        imageUrl: article.newsletter.imageUrl,
        articleTitle: article.title,
        articleId: article.id,
        status: article.status,
      });
    });
    for (let i = 0; i < 31; i++) {
      articlesForMonth.push({
        publishDate: i + 1,
        receivedUnread: articlesForDate[i].length,
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
        status: true,
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
}
