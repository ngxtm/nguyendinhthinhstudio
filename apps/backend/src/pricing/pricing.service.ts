import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import catalog from '@ndt/types/pricing-catalog.json';
import type {
  AdminPricing,
  PricingCategoryId,
  PricingPrices,
  PublicPricing,
  UpdatePricing,
} from '@ndt/types';
import { PrismaService } from '../prisma/prisma.service';
import { PRICING_SETTINGS_PREFIX } from './pricing.constants';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private category(id: string) {
    const category = catalog.find((item) => item.id === id);
    if (!category) throw new NotFoundException('Không tìm thấy nhóm bảng giá.');
    return category;
  }

  private validatePrices(category: string, prices: unknown): PricingPrices {
    const packages = this.category(category).packages;
    if (
      !prices ||
      typeof prices !== 'object' ||
      Array.isArray(prices) ||
      Object.keys(prices).length !== packages.length ||
      packages.some((item) => {
        const value: unknown = Object.prototype.hasOwnProperty.call(
          prices,
          item.id,
        )
          ? (prices as Record<string, unknown>)[item.id]
          : undefined;
        return (
          typeof value !== 'number' ||
          !Number.isSafeInteger(value) ||
          value < 1 ||
          value > 999_999_999
        );
      })
    ) {
      throw new BadRequestException(
        'Hãy nhập đủ giá các gói bằng VNĐ, từ 1 đến 999.999.999 đồng, không có số lẻ.',
      );
    }
    return Object.fromEntries(
      packages.map((item) => [item.id, (prices as PricingPrices)[item.id]]),
    );
  }

  private read(categoryId: string, value?: string): AdminPricing {
    const category = this.category(categoryId);
    if (value === undefined) {
      const defaults = Object.fromEntries(
        category.packages.map((item) => [item.id, item.priceVnd]),
      );
      return {
        category: categoryId as PricingCategoryId,
        revision: 'initial',
        draft: { ...defaults },
        published: { ...defaults },
        draftSavedAt: null,
        publishedAt: null,
      };
    }
    try {
      const parsed = JSON.parse(value) as AdminPricing;
      if (
        parsed.category !== categoryId ||
        typeof parsed.revision !== 'string' ||
        !parsed.revision ||
        ![parsed.draftSavedAt, parsed.publishedAt].every(
          (date) =>
            date === null ||
            (typeof date === 'string' && Number.isFinite(Date.parse(date))),
        )
      ) {
        throw new Error('Invalid pricing state');
      }
      return {
        category: parsed.category,
        revision: parsed.revision,
        draft: this.validatePrices(categoryId, parsed.draft),
        published: this.validatePrices(categoryId, parsed.published),
        draftSavedAt: parsed.draftSavedAt,
        publishedAt: parsed.publishedAt,
      };
    } catch {
      throw new InternalServerErrorException(
        'Không thể đọc bảng giá đã lưu. Vui lòng liên hệ quản trị viên.',
      );
    }
  }

  async getConfiguration(category: string): Promise<AdminPricing> {
    this.category(category);
    const row = await this.prisma.siteSettings.findUnique({
      where: { key: PRICING_SETTINGS_PREFIX + category },
    });
    return this.read(category, row?.value);
  }

  async getPublished(category: string): Promise<PublicPricing> {
    const state = await this.getConfiguration(category);
    return {
      category: state.category,
      prices: state.published,
      publishedAt: state.publishedAt,
    };
  }

  async save(
    category: string,
    input: UpdatePricing,
    publish: boolean,
  ): Promise<AdminPricing> {
    const prices = this.validatePrices(category, input.prices);
    const key = PRICING_SETTINGS_PREFIX + category;
    const row = await this.prisma.siteSettings.findUnique({ where: { key } });
    const current = this.read(category, row?.value);
    if (input.revision !== current.revision) this.conflict();
    const now = new Date().toISOString();
    const next: AdminPricing = {
      ...current,
      revision: randomUUID(),
      draft: prices,
      draftSavedAt: now,
      ...(publish ? { published: { ...prices }, publishedAt: now } : {}),
    };
    const value = JSON.stringify(next);
    if (row) {
      // Compare the exact document as well as the revision so two admins cannot overwrite one another.
      const result = await this.prisma.siteSettings.updateMany({
        where: { key, value: row.value },
        data: { value },
      });
      if (result.count !== 1) this.conflict();
    } else {
      try {
        await this.prisma.siteSettings.create({ data: { key, value } });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') this.conflict();
        throw error;
      }
    }
    return next;
  }

  private conflict(): never {
    throw new ConflictException(
      'Bảng giá đã được thay đổi ở phiên khác. Hãy tải lại bảng giá trước khi lưu.',
    );
  }
}
