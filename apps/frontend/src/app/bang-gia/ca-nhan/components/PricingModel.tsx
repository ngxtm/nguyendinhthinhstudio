import DividerWithText from '@/app/components/common/DividerWithText'
import { pricingPackages } from '../data/ca-nhan'
import { FaRegCheckCircle } from 'react-icons/fa'
import { IoMdCloseCircleOutline } from 'react-icons/io'
import Link from 'next/link'

export default function PricingModel() {
  return (
    <>
      {pricingPackages.map(item => (
        <div key={item.id} className="space-y-6">
          <DividerWithText
            text="NGUYỄN ĐÌNH THỊNH STUDIO"
            textClassName="text-[#888888] text-sm md:text-base"
            className="px-1.5"
          />
          <div className='relative'>
          {/* Overlay màu xám full width */}
          <div className="bg-opacity-30 pointer-events-none absolute inset-x-0 -inset-y-2 right-1/2 left-1/2 z-10 -mx-[50vw] w-screen bg-[#d8d8d8]" />

          <div className="relative z-20 flex flex-col gap-4 rounded-3xl border-2 border-black">
            <div className="relative z-20 overflow-hidden text-center">
              <p className="text-sm font-bold md:text-2xl">{item.title}</p>
              <h3 className="text-xl font-bold md:text-7xl">{item.type}</h3>
              {/* Label BEST chéo góc */}
              <div className="absolute top-7 -right-11 z-20 rotate-45 bg-white px-16 text-[14px] py-1 text-xs font-bold text-[#d8d8d8]">
                {item.angleLable}
              </div>
            </div>
            <div className="z-20 flex flex-col items-center">
              {item.services.map(service => (
                <div key={service.id}>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-[#585858] md:text-base">
                    {service.isActive ? (
                      <FaRegCheckCircle size={18} className="text-black" />
                    ) : (
                      <IoMdCloseCircleOutline size={21} className="text-black" />
                    )}
                    {service.content}
                  </p>
                </div>
              ))}
            </div>
            <p className="z-20 px-10 py-4 text-center text-sm font-semibold text-[#888888] md:text-base">
              {item.subContent}
            </p>
          </div>
          </div>
          <div className="flex flex-col gap-4 text-center md:flex-row">
            {item.subCard.map(card => (
              <div
                key={card.title}
                className={`flex w-1/2 flex-col overflow-hidden rounded-xl border-2 border-[#888888]`}
              >
                <div className="flex-1 space-y-8 px-10 py-4">
                  <div>
                    <h4 className="pt-4 text-2xl font-bold">{card.title}</h4>
                    <p className="gap-0.5 text-7xl font-bold">
                      {card.price} <span className="-ml-5 text-sm">k</span>{' '}
                    </p>
                  </div>
                  <div>
                    {card.services.map(service => (
                      <div key={service.id} className="text-center">
                        <p className="text-sm font-bold text-[#585858] md:text-[15px]">{service.content}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm font-bold text-[#cccccc] md:text-[15px]">{card.subContent}</p>
                </div>
                <Link
                  href="/lien-he#lien-he-nhanh"
                  className="block w-full bg-[#cccccc] py-4 text-center font-semibold text-[#585858] transition-colors hover:text-white"
                >
                  Đặt lịch
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
