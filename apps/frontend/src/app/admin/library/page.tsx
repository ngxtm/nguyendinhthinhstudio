"use client";

/**
 * Quản lý thư viện
 * Cấu hình branding studio + gallery (lưu qua SiteSettings key-value).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSiteSettings, updateSiteSetting } from '@/lib/api';
import { useAbortableEffect } from '@/app/admin/hooks';

interface BrandingSettings {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  facebook: string;
  instagram: string;
  workingHours: string;
}

interface GallerySettings {
  defaultAlbumStatus: 'draft' | 'published';
  featuredLimit: number;
  galleryPageSize: number; // số album (bộ ảnh) mỗi trang gallery
}

const DEFAULT_BRANDING: BrandingSettings = {
  name: '',
  tagline: '',
  phone: '',
  email: '',
  address: '',
  facebook: '',
  instagram: '',
  workingHours: '',
};

const DEFAULT_GALLERY: GallerySettings = {
  defaultAlbumStatus: 'draft',
  featuredLimit: 8,
  galleryPageSize: 24,
};

export default function LibrarySettingsPage() {
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [gallery, setGallery] = useState<GallerySettings>(DEFAULT_GALLERY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'branding' | 'gallery' | null>(null);

  useAbortableEffect((signal) => {
    async function load() {
      try {
        const settings = await getSiteSettings();
        if (signal.aborted) return;
        if (settings.branding) setBranding({ ...DEFAULT_BRANDING, ...(settings.branding as Partial<BrandingSettings>) });
        if (settings.gallery) setGallery({ ...DEFAULT_GALLERY, ...(settings.gallery as Partial<GallerySettings>) });
      } catch (err) {
        if (!signal.aborted) toast.error('Không thể tải cấu hình thư viện');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }
    load();
  }, []);

  const saveBranding = async () => {
    setSaving('branding');
    try {
      await updateSiteSetting('branding', branding);
      toast.success('Đã lưu thông tin studio');
    } catch {
      toast.error('Lưu thông tin studio thất bại');
    } finally {
      setSaving(null);
    }
  };

  const saveGallery = async () => {
    setSaving('gallery');
    try {
      await updateSiteSetting('gallery', gallery);
      toast.success('Đã lưu cấu hình gallery');
    } catch {
      toast.error('Lưu cấu hình gallery thất bại');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-gray-500">Đang tải cấu hình…</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quản lý thư viện</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cấu hình thông tin studio hiển thị công khai và hành vi gallery.
        </p>
      </div>

      {/* Branding */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Thông tin studio</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tên studio">
            <input
              type="text"
              value={branding.name}
              onChange={(e) => setBranding({ ...branding, name: e.target.value })}
              className="input"
              placeholder="NDT Studio"
            />
          </Field>
          <Field label="Tagline / Slogan">
            <input
              type="text"
              value={branding.tagline}
              onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
              className="input"
              placeholder="Chụp ảnh cưới & sự kiện"
            />
          </Field>
          <Field label="Số điện thoại">
            <input
              type="text"
              value={branding.phone}
              onChange={(e) => setBranding({ ...branding, phone: e.target.value })}
              className="input"
              placeholder="0901234567"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={branding.email}
              onChange={(e) => setBranding({ ...branding, email: e.target.value })}
              className="input"
              placeholder="contact@ndt.studio"
            />
          </Field>
          <Field label="Địa chỉ" className="sm:col-span-2">
            <input
              type="text"
              value={branding.address}
              onChange={(e) => setBranding({ ...branding, address: e.target.value })}
              className="input"
              placeholder="123 Lê Lợi, Q.1, TP. HCM"
            />
          </Field>
          <Field label="Giờ làm việc" className="sm:col-span-2">
            <input
              type="text"
              value={branding.workingHours}
              onChange={(e) => setBranding({ ...branding, workingHours: e.target.value })}
              className="input"
              placeholder="T2–T7, 8:00–20:00"
            />
          </Field>
          <Field label="Facebook">
            <input
              type="url"
              value={branding.facebook}
              onChange={(e) => setBranding({ ...branding, facebook: e.target.value })}
              className="input"
              placeholder="https://facebook.com/ndtstudio"
            />
          </Field>
          <Field label="Instagram">
            <input
              type="url"
              value={branding.instagram}
              onChange={(e) => setBranding({ ...branding, instagram: e.target.value })}
              className="input"
              placeholder="https://instagram.com/ndtstudio"
            />
          </Field>
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={saveBranding}
            disabled={saving === 'branding'}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'branding' ? 'Đang lưu…' : 'Lưu thông tin studio'}
          </button>
        </div>
      </section>

      {/* Gallery config */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Cấu hình gallery</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Trạng thái album mặc định">
            <select
              value={gallery.defaultAlbumStatus}
              onChange={(e) =>
                setGallery({ ...gallery, defaultAlbumStatus: e.target.value as 'draft' | 'published' })
              }
              className="input"
            >
              <option value="draft">Bản nháp</option>
              <option value="published">Công khai</option>
            </select>
          </Field>
          <Field label="Số album nổi bật (homepage)">
            <input
              type="number"
              min={1}
              max={50}
              value={gallery.featuredLimit}
              onChange={(e) => setGallery({ ...gallery, featuredLimit: Number(e.target.value) })}
              className="input"
            />
          </Field>
          <Field label="Số bộ ảnh mỗi trang gallery">
            <input
              type="number"
              min={1}
              max={120}
              value={gallery.galleryPageSize}
              onChange={(e) => setGallery({ ...gallery, galleryPageSize: Number(e.target.value) })}
              className="input"
            />
          </Field>
        </div>
        <div className="mt-5">
          <button
            type="button"
            onClick={saveGallery}
            disabled={saving === 'gallery'}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving === 'gallery' ? 'Đang lưu…' : 'Lưu cấu hình gallery'}
          </button>
        </div>
      </section>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          background: #fff;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #111827;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        :global(.input:focus) {
          border-color: #2563eb;
          box-shadow: 0 0 0 1px #2563eb;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}