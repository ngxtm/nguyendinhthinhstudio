import type { SupabaseClient, User } from '@supabase/supabase-js';

export function safeAdminPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/admin') || value.startsWith('//') || value.includes('://') || value === '/admin/login' || value.startsWith('/admin/login?')) return '/admin';
  return value;
}

export function getAccessTokenRole(token: string | null | undefined): 'admin' | undefined {
  if (!token) return undefined;
  try {
    const segment = token.split('.')[1];
    if (!segment) return undefined;
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(segment.length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalized)) as { user_role?: unknown };
    return payload.user_role === 'admin' ? 'admin' : undefined;
  } catch {
    return undefined;
  }
}

export async function signInAdmin(client: SupabaseClient, email: string, password: string) {
  return client.auth.signInWithPassword({ email: email.trim(), password });
}

export async function signOutAndReturnToAdminLogin(
  client: { auth: { signOut: () => Promise<unknown> } },
  router: { replace: (href: string) => void },
) {
  await client.auth.signOut();
  router.replace('/admin/login');
}

export async function getAdminUser(client: SupabaseClient): Promise<User | null> {
  const { data } = await client.auth.getUser();
  return data.user;
}
