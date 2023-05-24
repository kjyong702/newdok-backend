import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NewslettersService {
  constructor(private prisma: PrismaService) {}

  async create(body: any) {
    return this.prisma.newsletter.create({
      data: body,
    });
  }

  async findOne(id: string) {
    return this.prisma.newsletter.findUnique({
      where: { id: parseInt(id) },
    });
  }

  async findAll() {
    return this.prisma.newsletter.findMany();
  }

  async deleteOne(id: string) {
    return this.prisma.newsletter.delete({
      where: { id: parseInt(id) },
    });
  }
}
