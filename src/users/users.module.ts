import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { NewslettersService } from 'src/newsletters/newsletters.service';
import { ArticlesService } from 'src/articles/articles.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, NewslettersService, ArticlesService, PrismaService],
})
export class UsersModule {}
