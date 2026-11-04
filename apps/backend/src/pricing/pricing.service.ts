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
  PricingCatalogCategory,
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
    return category as PricingCatalogCategory;
  }

  private validatePrices(category: string, prices: unknown): PricingPrices {
    const packages = this.category(category).packages.flatMap((item) => [
      item,
      ...(item.additionalRates ?? []),
    ]);
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

  private validateHiddenPackageIds(category: string, value: unknown): string[] {
    const packageIds = new Set(
      this.category(category).packages.map((item) => item.id),
    );
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== 'string' || !packageIds.has(id)) ||
      new Set(value).size !== value.length
    ) {
      throw new BadRequestException('Danh sách gói ngừng bán không hợp lệ.');
    }
    return [...value] as string[];
  }

  private read(categoryId: string, value?: string): AdminPricing {
    const category = this.category(categoryId);
    if (value === undefined) {
      const defaults = Object.fromEntries(
        category.packages
          .flatMap((item) => [item, ...(item.additionalRates ?? [])])
          .map((item) => [item.id, item.priceVnd]),
      );
      return {
        category: categoryId as PricingCategoryId,
        revision: 'initial',
        draft: { ...defaults },
        published: { ...defaults },
        draftHiddenPackageIds: [],
        publishedHiddenPackageIds: [],
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
        draftHiddenPackageIds: this.validateHiddenPackageIds(
          categoryId,
          parsed.draftHiddenPackageIds === undefined
            ? []
            : parsed.draftHiddenPackageIds,
        ),
        publishedHiddenPackageIds: this.validateHiddenPackageIds(
          categoryId,
          parsed.publishedHiddenPackageIds === undefined
            ? []
            : parsed.publishedHiddenPackageIds,
        ),
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
      hiddenPackageIds: state.publishedHiddenPackageIds,
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
    // Older clients only edit prices; preserve the saved availability when omitted.
    const hiddenPackageIds = this.validateHiddenPackageIds(
      category,
      input.hiddenPackageIds === undefined
        ? current.draftHiddenPackageIds
        : input.hiddenPackageIds,
    );
    const now = new Date().toISOString();
    const next: AdminPricing = {
      ...current,
      revision: randomUUID(),
      draft: prices,
      draftHiddenPackageIds: hiddenPackageIds,
      draftSavedAt: now,
      ...(publish
        ? {
            published: { ...prices },
            publishedHiddenPackageIds: [...hiddenPackageIds],
            publishedAt: now,
          }
        : {}),
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
