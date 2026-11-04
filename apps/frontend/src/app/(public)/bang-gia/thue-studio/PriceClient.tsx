import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import type { PricingPrices } from '@ndt/types'
import { formatPriceVnd, pricingCardGridClass } from '@/lib/pricing'
import EmptyPricing from '../components/EmptyPricing'
import { studioAmenities, studioRentalPackages } from './data/studio'

export default function StudioRentalPrice({
  prices,
  hiddenPackageIds = []
}: {
  prices: PricingPrices
  hiddenPackageIds?: string[]
}) {
  const packages = studioRentalPackages(prices, hiddenPackageIds)

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-8 md:space-y-16 md:px-10 md:py-14">
      <header className="space-y-5 text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
          NGUYỄN ĐÌNH THỊNH STUDIO
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-5xl">BẢNG GIÁ THUÊ STUDIO</h1>
        <p className="mx-auto max-w-xl text-sm leading-6 text-neutral-600 md:text-base dark:text-neutral-400">
          Chọn phông phù hợp với buổi chụp của bạn. Giá thuê cho 2 giờ đầu và mỗi giờ tiếp theo được niêm yết riêng bên
          dưới.
        </p>
      </header>

      {packages.length ? (
        <section aria-label="Các gói thuê studio" className={pricingCardGridClass(packages.length)}>
          {packages.map(item => (
            <article
              key={item.id}
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-300 dark:border-neutral-700"
            >
              <div className="border-b border-neutral-300 bg-neutral-100 px-6 py-5 dark:border-neutral-700 dark:bg-neutral-900">
                <h2 className="text-2xl font-bold">{item.name}</h2>
              </div>
              <div className="flex-1 space-y-7 px-6 py-8 md:px-8">
                <div>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">2 giờ đầu</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                    {formatPriceVnd(item.initialPrice)}
                  </p>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-neutral-200 pt-5 dark:border-neutral-800">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Mỗi giờ tiếp theo</p>
                  <p className="text-xl font-semibold tabular-nums">
                    {formatPriceVnd(item.hourlyPrice)}
                    <span className="ml-1 text-sm font-normal text-neutral-500">/giờ</span>
                  </p>
                </div>
              </div>
              <Link
                href="/lien-he#ho-tro-nhanh"
                className="flex min-h-12 items-center justify-center gap-2 bg-neutral-800 px-6 py-4 text-sm font-semibold text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-[-4px] dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white"
              >
                Liên hệ thuê studio <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <EmptyPricing />
      )}

      <section
        aria-labelledby="studio-space"
        className="border-y border-neutral-300 py-8 text-center dark:border-neutral-700"
      >
        <h2 id="studio-space" className="text-2xl font-bold md:text-3xl">
          Không gian rộng nhất Nha Trang
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-neutral-600 md:text-base dark:text-neutral-400">
          Có thể chụp với ống kính 70–200mm mà không lo chật góc, thoải mái chọn góc máy và bố trí buổi chụp.
        </p>
      </section>

      <section aria-labelledby="studio-amenities">
        <h2 id="studio-amenities" className="text-2xl font-bold">
          Tiện ích đi kèm
        </h2>
        <ul className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {studioAmenities.map(item => (
            <li key={item.title} className="flex items-start gap-3">
              <Check size={19} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-400">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="studio-extras" className="rounded-2xl bg-neutral-100 p-6 md:p-8 dark:bg-neutral-900">
        <h2 id="studio-extras" className="text-xl font-bold">
          Thuê thêm theo nhu cầu
        </h2>
        <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          Thuê thêm máy ảnh:{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">+400.000 ₫/giờ</span>.
        </p>
        <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-400">
          Đèn LED, phụ kiện hoặc trang phục: inbox riêng để được tư vấn và báo giá.
        </p>
        <Link
          href="/lien-he#ho-tro-nhanh"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-neutral-400 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Liên hệ tư vấn <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
