import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { simpleParser } from 'mailparser';
const Pop3Command = require('node-pop3');

@Injectable()
export class ArticlesService {
  constructor(private prisma: PrismaService) {}

  async getArticleById(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: {
        id: parseInt(articleId),
      },
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

  async POP3ForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    // subscribePassword 추가 필요
    const pop3 = new Pop3Command({
      user: user.subscribeEmail,
      password: '!Kktest',
      host: 'mail.newdok.site',
    });

    const emailList = await pop3.UIDL();
    const numOfArticles = await this.getNumOfArticlesForUser(userId);

    // 새롭게 수신된 POP3 이메일에 대해서만 파싱
    for (let i = numOfArticles + 1; i <= emailList.length; i++) {
      const rawEmail = await pop3.RETR(i);
      const parsedEmail = await simpleParser(rawEmail);

      const { address } = parsedEmail.from.value[0];
      const newsletter = await this.prisma.newsletter.findUnique({
        where: {
          brandEmail: address,
        },
      });
      await this.prisma.article.create({
        data: {
          title: parsedEmail.subject,
          body: parsedEmail.html as string,
          date: parsedEmail.date,
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
    return 1;
  }
}
