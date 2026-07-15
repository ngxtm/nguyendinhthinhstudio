'use client';

import React from 'react';
import Link from 'next/link';

export function AdminAccessDenied({
  onSignOut,
  signingOut = false,
}: {
  onSignOut: () => void;
  signingOut?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <section
        aria-labelledby="admin-access-denied-title"
        className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 text-center shadow"
      >
        <div className="space-y-2">
          <h1 id="admin-access-denied-title" className="text-2xl font-semibold text-gray-900">
            Không có quyền truy cập
          </h1>
          <p className="text-sm leading-6 text-gray-600">
            Phiên đăng nhập hiện tại chưa có quyền quản trị. Hãy đăng xuất rồi đăng nhập lại để
            nhận quyền mới nhất.
          </p>
        </div>

        <button
          type="button"
          disabled={signingOut}
          onClick={onSignOut}
          className="w-full rounded bg-gray-900 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất và đăng nhập lại'}
        </button>

        <Link
          href="/"
          className="inline-block text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          Về trang chính
        </Link>
      </section>
    </main>
  );
}
