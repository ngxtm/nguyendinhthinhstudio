import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as authSession from '../src/lib/auth/session';

test('denied admin screen offers sign-out and home actions', async () => {
  const componentPath = '../src/app/admin/access-denied';
  const deniedModule = await import(componentPath).catch(() => undefined);

  assert.ok(deniedModule, 'AdminAccessDenied component module must exist');
  const AdminAccessDenied = deniedModule.AdminAccessDenied as ComponentType<{
    onSignOut: () => void;
    signingOut?: boolean;
  }>;

  assert.equal(
    typeof AdminAccessDenied,
    'function',
    'AdminAccessDenied component must be exported',
  );

  const html = renderToStaticMarkup(
    createElement(AdminAccessDenied, {
      onSignOut: () => undefined,
    }),
  );

  assert.match(html, /Đăng xuất và đăng nhập lại/);
  assert.match(html, /href="\/"[^>]*>Về trang chính/);
});

test('denied admin sign-out clears the session before returning to login', async () => {
  const signOutAndReturnToAdminLogin = (
    authSession as typeof authSession & {
      signOutAndReturnToAdminLogin?: (
        client: { auth: { signOut: () => Promise<unknown> } },
        router: { replace: (href: string) => void },
      ) => Promise<void>;
    }
  ).signOutAndReturnToAdminLogin;

  assert.equal(
    typeof signOutAndReturnToAdminLogin,
    'function',
    'signOutAndReturnToAdminLogin helper must be exported',
  );
  if (!signOutAndReturnToAdminLogin) return;

  const calls: string[] = [];

  await signOutAndReturnToAdminLogin(
    {
      auth: {
        signOut: async () => {
          calls.push('signOut');
        },
      },
    },
    {
      replace: (href) => {
        calls.push(`replace:${href}`);
      },
    },
  );

  assert.deepEqual(calls, ['signOut', 'replace:/admin/login']);
});
