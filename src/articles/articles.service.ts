import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser } from 'mailparser';
const Pop3Command = require('node-pop3');

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  async POP3ForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    const pop3 = new Pop3Command({
      user: user.subscribeEmail,
      password: user.subscribePassword,
      host: 'mail.newdok.site',
    });

    const emailList = await pop3.UIDL();
    const numOfArticles = await this.getNumOfArticlesForUser(userId);

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
      await this.prisma.article.create({
        data: {
          title: parsedEmail.subject,
          body: parsedEmail.html as string,
          date: parsedEmail.date,
          publishMonth: new Date(parsedEmail.date).getMonth() + 1,
          publishDate: new Date(parsedEmail.date).getDate(),
          userId: parseInt(userId),
          newsletterId: newsletter.id,
        },
      });
      const isSubscribed = await this.prisma.newslettersOnUsers.findUnique({
        where: {
          userId_newsletterId: {
            userId: parseInt(userId),
            newsletterId: newsletter.id,
          },
        },
      });
      if (!isSubscribed) {
        await this.prisma.newslettersOnUsers.create({
          data: {
            userId: parseInt(userId),
            newsletterId: newsletter.id,
          },
        });
      }
    }
    await pop3.QUIT();

    return 'POP3 success';
  }

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
      articlesForDate[article.publishDate - 1].push(article);
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

  async getArticleById(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        id: parseInt(articleId),
      },
      include: { newsletter: true },
    });
    return article;
  }

  async getNumOfArticlesForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { articles: true },
    });
    return user.articles.length;
  }
}
