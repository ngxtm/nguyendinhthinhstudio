export type PricingCategoryId = 'ca-nhan' | 'couple' | 'gia-dinh' | 'wedding' | 'video' | 'team';
export type PricingPrices = Record<string, number>;

export interface PublicPricing {
    category: PricingCategoryId;
    prices: PricingPrices;
    publishedAt: string | null;
}

export interface AdminPricing {
    category: PricingCategoryId;
    revision: string;
    draft: PricingPrices;
    published: PricingPrices;
    draftSavedAt: string | null;
    publishedAt: string | null;
}

export interface UpdatePricing {
    revision: string;
    prices: PricingPrices;
}
