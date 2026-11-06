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
    <div className="space-y-12 md:space-y-16 mx-auto px-4 md:px-10 py-8 md:py-14 max-w-6xl">
      <header className="space-y-5 text-center">
        <p className="font-semibold text-neutral-500 dark:text-neutral-400 text-xs tracking-[0.2em]">
          NGUYỄN ĐÌNH THỊNH STUDIO
        </p>
        <h1 className="font-bold text-3xl md:text-5xl tracking-tight">BẢNG GIÁ THUÊ STUDIO</h1>
        <p className="mx-auto max-w-xl text-neutral-600 dark:text-neutral-400 text-sm md:text-base leading-6">
          Chọn phông phù hợp với buổi chụp của bạn. Giá thuê cho 2 giờ đầu và mỗi giờ tiếp theo được niêm yết riêng bên
          dưới.
        </p>
      </header>

      {packages.length ? (
        <section aria-label="Các gói thuê studio" className={pricingCardGridClass(packages.length)}>
          {packages.map(item => (
            <article
              key={item.id}
              className="flex flex-col border border-neutral-300 dark:border-neutral-700 rounded-2xl min-w-0 overflow-hidden"
            >
              <div className="bg-neutral-100 dark:bg-neutral-900 px-6 py-5 border-neutral-300 dark:border-neutral-700 border-b">
                <h2 className="font-bold text-2xl">{item.name}</h2>
              </div>
              <div className="flex-1 space-y-7 px-6 md:px-8 py-8">
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400 text-sm">2 giờ đầu</p>
                  <p className="mt-2 font-bold tabular-nums text-4xl sm:text-5xl tracking-tight">
                    {formatPriceVnd(item.initialPrice)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-between items-baseline gap-2 pt-5 border-neutral-200 dark:border-neutral-800 border-t">
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm">Mỗi giờ tiếp theo</p>
                  <p className="font-semibold tabular-nums text-xl">
                    {formatPriceVnd(item.hourlyPrice)}
                    <span className="ml-1 font-normal text-neutral-500 text-sm">/giờ</span>
                  </p>
                </div>
              </div>
              <Link
                href="/lien-he#ho-tro-nhanh"
                className="flex justify-center items-center gap-2 bg-neutral-800 hover:bg-black dark:bg-neutral-200 dark:hover:bg-white px-6 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-4px] min-h-12 font-semibold text-white dark:text-neutral-900 text-sm transition-colors"
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
        className="py-8 border-neutral-300 border-y dark:border-neutral-700 text-center"
      >
        <h2 id="studio-space" className="font-bold text-2xl md:text-3xl">
          Không gian rộng nhất Nha Trang
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-neutral-600 dark:text-neutral-400 text-sm md:text-base leading-6">
          Có thể chụp với ống kính 70–200mm mà không lo chật góc, thoải mái chọn góc máy và bố trí buổi chụp.
        </p>
      </section>

      <section aria-labelledby="studio-amenities">
        <h2 id="studio-amenities" className="font-bold text-2xl">
          Tiện ích đi kèm
        </h2>
        <ul className="gap-x-8 gap-y-6 grid sm:grid-cols-2 lg:grid-cols-3 mt-6">
          {studioAmenities.map(item => (
            <li key={item.title} className="flex items-start gap-3">
              <Check size={19} className="mt-0.5 text-neutral-500 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-neutral-600 dark:text-neutral-400 text-sm leading-6">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="studio-extras" className="bg-neutral-100 dark:bg-neutral-900 p-6 md:p-8 rounded-2xl">
        <h2 id="studio-extras" className="font-bold text-xl">
          Thuê thêm theo nhu cầu
        </h2>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400 text-sm leading-6">
          Thuê thêm máy lạnh:{' '}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">+400.000 ₫/giờ</span>.
        </p>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400 text-sm leading-6">
          Đèn LED, phụ kiện hoặc trang phục: inbox riêng để được tư vấn và báo giá.
        </p>
        <Link
          href="/lien-he#ho-tro-nhanh"
          className="inline-flex items-center gap-2 mt-4 focus-visible:outline-2 focus-visible:outline-offset-4 min-h-11 font-semibold text-sm decoration-neutral-400 hover:decoration-current underline underline-offset-4"
        >
          Liên hệ tư vấn <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
