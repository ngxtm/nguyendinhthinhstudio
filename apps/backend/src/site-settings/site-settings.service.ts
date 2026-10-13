import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HOMEPAGE_COLLECTION_KEY } from './homepage-collection.service';

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all settings as a key->parsed-value map.
   */
  async findAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.siteSettings.findMany();
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.key] = this.parseValue(row.value);
    }
    return result;
  }

  /**
   * Get a single setting value (or undefined when missing).
   */
  async findOne(key: string): Promise<unknown> {
    const row = await this.prisma.siteSettings.findUnique({ where: { key } });
    return row ? this.parseValue(row.value) : undefined;
  }

  /**
   * Upsert a setting. The value is JSON-encoded before persistence.
   */
  async upsert(key: string, value: unknown): Promise<unknown> {
    if (key === HOMEPAGE_COLLECTION_KEY) {
      throw new BadRequestException(
        'Hãy lưu bộ ảnh trang chủ qua mục Trang chủ trong admin.',
      );
    }
    const encoded = JSON.stringify(value);
    await this.prisma.siteSettings.upsert({
      where: { key },
      create: { key, value: encoded },
      update: { value: encoded },
    });
    return value;
  }

  private parseValue(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
