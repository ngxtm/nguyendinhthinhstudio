import test from 'node:test'
import assert from 'node:assert/strict'
import { getAdminErrorMessage } from '../src/app/admin/error-message'

test('admin error copy falls back when backend returns English', () => {
  const fallback = 'Không thể lưu thông tin'

  assert.equal(getAdminErrorMessage(new Error('Internal Server Error'), fallback), fallback)
  assert.equal(getAdminErrorMessage({ data: { message: 'Album already exists' } }, fallback), fallback)
})

test('admin error copy preserves Vietnamese backend messages', () => {
  const message = 'Tên bộ ảnh đã tồn tại'

  assert.equal(getAdminErrorMessage({ data: { message } }, 'Không thể lưu thông tin'), message)
  assert.equal(
    getAdminErrorMessage({ message: ['Vui lòng chọn ảnh', 'trước khi xuất bản'] }, 'Có lỗi xảy ra'),
    'Vui lòng chọn ảnh trước khi xuất bản'
  )
})
