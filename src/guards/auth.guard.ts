import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    const accessToken = request.headers.authorization?.split('Bearer ')[1];
    if (!accessToken) {
      throw new BadRequestException();
    }
    try {
      const payload = await this.jwtService.verifyAsync(accessToken, {
        secret: process.env.JWT_SECRET_KEY,
      });

      if (typeof payload?.id !== 'number') {
        throw new UnauthorizedException();
      }

      const user = await this.prisma.user.findUnique({
        where: {
          id: payload.id,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      request['user'] = { id: user.id };
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}
