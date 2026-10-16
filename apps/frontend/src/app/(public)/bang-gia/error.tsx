'use client'

export default function PricingError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold">Chưa thể tải bảng giá</h1>
      <p>Vui lòng thử lại để xem giá dịch vụ mới nhất hoặc liên hệ studio để được tư vấn.</p>
      <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-current px-5 py-2">
        Thử lại
      </button>
    </div>
  )
}
