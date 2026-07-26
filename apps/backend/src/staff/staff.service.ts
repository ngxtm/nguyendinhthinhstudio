import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.staff.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException(`Staff ${id} không tồn tại`);
    return staff;
  }

  async create(dto: CreateStaffDto) {
    if (dto.email) {
      const existing = await this.prisma.staff.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email đã được sử dụng');
    }
    return this.prisma.staff.create({ data: dto });
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findOne(id);
    if (dto.email) {
      const existing = await this.prisma.staff.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) throw new ConflictException('Email đã được sử dụng');
    }
    return this.prisma.staff.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.staff.delete({ where: { id } });
  }
}