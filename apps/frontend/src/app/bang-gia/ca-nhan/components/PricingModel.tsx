import DividerWithText from '@/app/components/common/DividerWithText'
import { FaRegCheckCircle } from 'react-icons/fa'
import { IoMdCloseCircleOutline } from 'react-icons/io'
import Link from 'next/link'

interface ServiceItem {
  id: string
  content: string
  isActive?: boolean
  angleLable?: string
}

interface SubCard {
  title: string
  price: number
  services: ServiceItem[]
  subContent: string
  angleLable?: string
  isPerPerson?: boolean
}

interface PricingPackage {
  id: string
  title: string
  type: string
  services: ServiceItem[]
  angleLable: string
  subContent: string
  subCard: SubCard[]
}

interface PricingModelProps {
  pricingPackages: PricingPackage[]
}

export default function PricingModel({ pricingPackages }: Readonly<PricingModelProps>) {
  return (
    <>
      {pricingPackages?.map(item => (
        <div key={item.id} className="space-y-6">
          <DividerWithText
            text="NGUYỄN ĐÌNH THỊNH STUDIO"
            textClassName="text-[#888888] text-sm md:text-base"
            className="px-1.5"
          />
          <div className="relative">
            {/* Overlay màu xám full width */}
            <div className="bg-opacity-30 pointer-events-none absolute -inset-y-2 left-1/2 z-10 min-w-[100vw] -translate-x-1/2 bg-[#d8d8d8]" />

            {/* Div giới thiệu chính */}
            <div className="relative z-20 flex flex-col gap-2 space-y-3 overflow-hidden rounded-3xl border-2 border-black md:gap-4">
              {/* Label chéo góc */}
              <div
                className={`absolute top-3 z-20 rotate-45 bg-white px-14 py-1 text-xs text-[11px] font-bold text-[#d8d8d8] md:top-5 md:px-16 md:text-[14px] ${item.angleLable === 'PRIVATE' ? '-right-15' : '-right-13'} `}
              >
                {item.angleLable}
              </div>

              <div className="text-center">
                <p className="mt-7 mb-0 text-xl font-bold md:text-2xl">{item.title}</p>
                <h3 className="mb-0 text-5xl font-bold md:text-7xl">{item.type}</h3>
              </div>

              <div className="z-20 mb-0 flex flex-col items-center">
                {item.services.map(service => (
                  <div key={service.id}>
                    <p className="flex items-center gap-1.5 text-xs leading-6 font-bold text-[#585858] md:text-base">
                      {service.isActive ? (
                        <FaRegCheckCircle className="h-3.5 w-3.5 text-black md:h-[18px] md:w-[18px]" />
                      ) : (
                        <IoMdCloseCircleOutline className="h-4 w-4 text-black md:h-[21px] md:w-[21px]" />
                      )}
                      {service.content}
                    </p>
                  </div>
                ))}
              </div>

              <p className="z-20 mt-2 px-2 py-2 text-center text-xs font-semibold text-[#888888] md:px-10 md:py-4 md:text-base">
                {item.subContent}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-4 text-center md:flex-row">
            {item.subCard.map(card => (
              <div
                key={card.title}
                className={`relative z-20 flex w-full flex-col overflow-hidden rounded-xl border-2 border-[#888888]`}
              >
                {/* Label chéo góc */}
                {card.angleLable && (
                  <div className="absolute top-5 -right-17 z-20 rotate-45 bg-[#d8d8d8] px-16 py-1 text-xs text-[10px] font-bold text-[#585858]">
                    {card.angleLable}
                  </div>
                )}
                <div className="flex-1 space-y-8 px-6 py-4">
                  <div>
                    <h4 className="pt-4 text-2xl font-bold">{card.title}</h4>
                    <p className={`gap-0.5 text-7xl font-bold ${card.angleLable ? 'gold-sparkle' : ''}`}>
                      {card.price} <span className="-ml-5 text-sm">k{card.isPerPerson ? '/người' : ''}</span>{' '}
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
                  href="/lien-he#ho-tro-nhanh"
                  className="block w-full bg-[#cccccc] py-4 text-center font-semibold text-[#585858] transition-colors hover:text-white"
                >
                  Đặt lịch
                </Link>
              </div>
            ))}
          </div>
          {/* Local styles for gold gradient + moving glitter effect */}
      <style>{`
        .gold-sparkle {
          background-image: linear-gradient(90deg, #b58b2a, #f3e27a, #d4af37, #b58b2a);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: goldFlow 6s linear infinite;
          position: relative;
        }
        .gold-sparkle:after {
          content: '';
          position: absolute;
          top: 0;
          left: -150%;
          width: 150%;
          height: 100%;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.9) 20%, transparent 40%);
          animation: shine 2.8s ease-in-out infinite;
          -webkit-background-clip: text;
          background-clip: text;
        }
        @keyframes goldFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes shine {
          0% { transform: translateX(0); }
          100% { transform: translateX(200%); }
        }
      `}</style>
        </div>
      ))}
    </>
  )
}
