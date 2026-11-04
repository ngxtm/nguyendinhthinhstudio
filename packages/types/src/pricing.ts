export type PricingCategoryId = 'ca-nhan' | 'couple' | 'gia-dinh' | 'wedding' | 'video' | 'team';
export type PricingPrices = Record<string, number>;

export interface PublicPricing {
    category: PricingCategoryId;
    prices: PricingPrices;
    hiddenPackageIds: string[];
    publishedAt: string | null;
}

export interface AdminPricing {
    category: PricingCategoryId;
    revision: string;
    draft: PricingPrices;
    published: PricingPrices;
    draftHiddenPackageIds: string[];
    publishedHiddenPackageIds: string[];
    draftSavedAt: string | null;
    publishedAt: string | null;
}

export interface UpdatePricing {
    revision: string;
    prices: PricingPrices;
    hiddenPackageIds?: string[];
}
