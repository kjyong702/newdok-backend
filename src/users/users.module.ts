import { Module } from '@nestjs/common';
import { NewslettersModule } from '../newsletters/newsletters.module';
import { ArticlesModule } from '../articles/articles.module';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    NewslettersModule,
    ArticlesModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
})
export class UsersModule {}
