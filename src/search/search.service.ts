import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}
}
