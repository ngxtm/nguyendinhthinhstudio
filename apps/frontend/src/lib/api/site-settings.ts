/**
 * Site Settings API Service
 */

import { adminApiClient } from './client';

export type SiteSettingsMap = Record<string, unknown>;

/**
 * Get all site settings (admin only).
 */
export async function getSiteSettings(): Promise<SiteSettingsMap> {
  return adminApiClient<SiteSettingsMap>('/site-settings');
}

/**
 * Get a single setting by key (admin only).
 */
export async function getSiteSetting(key: string): Promise<unknown> {
  return adminApiClient<unknown>(`/site-settings/${encodeURIComponent(key)}`);
}

/**
 * Upsert a setting by key (admin only). Value may be any JSON-serialisable type.
 */
export async function updateSiteSetting(key: string, value: unknown): Promise<unknown> {
  return adminApiClient<unknown>(`/site-settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}