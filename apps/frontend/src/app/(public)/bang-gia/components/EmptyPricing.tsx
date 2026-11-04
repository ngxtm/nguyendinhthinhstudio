import Link from 'next/link'

export default function EmptyPricing() {
  return (
    <div className="rounded-2xl border border-neutral-300 px-6 py-12 text-center dark:border-neutral-700">
      <h2 className="text-xl font-semibold">Các gói dịch vụ đang tạm ngừng mở bán</h2>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        Liên hệ NDT Studio để được tư vấn gói dịch vụ phù hợp với bạn.
      </p>
      <Link
        href="/lien-he#ho-tro-nhanh"
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-neutral-800 px-6 text-sm font-semibold text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-4 dark:bg-neutral-200 dark:text-neutral-900"
      >
        Liên hệ tư vấn
      </Link>
    </div>
  )
}
