'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/auth/supabase';
import { safeAdminPath } from '@/lib/auth/session';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await getBrowserSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      const next = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next');
      router.replace(safeAdminPath(next));
      router.refresh();
    } catch {
      setError('Email hoặc mật khẩu không hợp lệ.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-xl bg-white p-8 shadow">
        <div>
          <h1 className="text-2xl font-semibold">NDT Studio Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Đăng nhập bằng tài khoản quản trị Supabase.</p>
        </div>
        <label className="block text-sm">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </main>
  );
}
