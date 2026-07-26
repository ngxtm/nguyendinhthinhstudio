import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/admin/staff/page.tsx', import.meta.url), 'utf8')

test('staff table balances columns across the available content width', () => {
  assert.match(source, /<div className="w-full overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">/)
  assert.match(source, /<table className="w-full min-w-\[48rem\] table-fixed divide-y divide-gray-200">/)
  assert.match(source, /<th className="w-\[26%\][^"]*">\s*Nhân viên\s*<\/th>/)
  assert.match(source, /<th className="w-\[26%\][^"]*">\s*Liên hệ\s*<\/th>/)
  assert.match(source, /<th className="w-\[18%\][^"]*">\s*Vai trò\s*<\/th>/)
  assert.match(source, /<th className="w-\[16%\][^"]*">\s*Trạng thái\s*<\/th>/)
  assert.match(source, /<th className="w-\[14%\][^"]*">\s*Thao tác\s*<\/th>/)
  assert.match(source, /<td className="min-w-\[10rem\][^"]*whitespace-nowrap">/)
  assert.match(source, /<td className="min-w-\[11rem\][^"]*text-sm text-gray-600">/)
  assert.match(source, /<div className="flex min-w-0 items-center gap-3 overflow-hidden">/)
  assert.match(source, /className="min-w-0 flex-1"/)
  assert.match(source, /title=\{s\.fullName\} className="truncate font-medium text-gray-900"/)
  assert.match(source, /<div className="min-w-0 space-y-1 overflow-hidden whitespace-nowrap">/)
  assert.match(source, /title=\{s\.phone\} className="truncate"/)
  assert.match(source, /title=\{s\.email\} className="truncate text-gray-500"/)
})
