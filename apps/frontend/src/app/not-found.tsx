/**
 * 404 Not Found Page
 * Custom 404 page with SEO
 */

import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Không tìm thấy trang',
  description: 'Trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-200 mb-4">
          Không tìm thấy trang
        </h2>
        <p className="text-gray-600 dark:text-gray-300 mb-8 max-w-md mx-auto">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển. Vui lòng kiểm tra lại URL
          hoặc quay về trang chủ.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Về trang chủ
          </Link>
          <Link
            href="/thu-vien"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-800 transition-colors"
          >
            Xem thư viện
          </Link>
        </div>
      </div>
    </div>
  );
}
