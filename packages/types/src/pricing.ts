export type PricingCategoryId =
    | 'ca-nhan'
    | 'couple'
    | 'gia-dinh'
    | 'wedding'
    | 'video'
    | 'team'
    | 'thue-studio';
export type PricingPrices = Record<string, number>;

export interface PricingRate {
    id: string;
    label: string;
    priceVnd: number;
    unit: string;
}

export interface PricingCatalogPackage {
    id: string;
    name: string;
    tier: string;
    priceVnd: number;
    unit: string;
    additionalRates?: PricingRate[];
}

export interface PricingCatalogCategory {
    id: PricingCategoryId;
    label: string;
    packages: PricingCatalogPackage[];
}

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
