import Image from 'next/image'
import img from '../images/p1.jpg'
import img2 from '../images/p2.jpg'
import img3 from '../images/p3.jpg'

export default function ProcedureHeroComponent() {
  return (
    <div className="min-h-screen bg-black">
      {/* Mobile Layout */}
      <div className="md:hidden">
        {/* Header Section */}
        <div className="px-4 py-12 text-center space-y-6">
          <p className="text-xs text-[#686868] dark:text-neutral-400 tracking-widest">NGUYỄN ĐÌNH THỊNH STUDIO</p>
          <h1 className="text-4xl font-bold text-white leading-tight">QUY TRÌNH CHỤP ẢNH</h1>
        </div>

        {/* Featured Image */}
        <div className="px-4 mb-8">
          <div className="relative aspect-[4/5] w-full max-w-sm mx-auto overflow-hidden rounded-2xl">
            <Image src={img} alt="procedure" fill className="object-cover" priority/>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 mb-12">
          <p className="text-white text-center leading-relaxed text-sm">
            Quy trình của chúng tôi bắt đầu với việc lắng nghe sâu sắc ý tưởng và mong đợi của khách hàng. Chúng tôi tìm
            hiểu về cá nhân hóa và sở thích của họ để tạo ra một trải nghiệm chụp ảnh độc đáo và đáng nhớ.
          </p>
        </div>

        {/* Image Gallery */}
        <div className="px-4 pb-12">
          <div className="flex gap-4 overflow-x-auto scrollbar-hide">
            <div className="relative aspect-[3/4] w-48 flex-shrink-0 overflow-hidden rounded-xl">
              <Image src={img2} alt="procedure" fill className="object-cover" priority/>
            </div>
            <div className="relative aspect-[3/4] w-48 flex-shrink-0 overflow-hidden rounded-xl">
              <Image src={img3} alt="procedure" fill className="object-cover" priority/>
            </div>
            <div className="relative aspect-[3/4] w-48 flex-shrink-0 overflow-hidden rounded-xl">
              <Image src={img} alt="procedure" fill className="object-cover" priority/>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout - Keep Original */}
      <div className="hidden md:flex min-h-screen flex-row justify-center gap-10 py-30 px-8">
        <div className="my-auto w-[22vw] space-y-6">
          <p className="pb-6 text-base text-[#686868] dark:text-neutral-400">NGUYỄN ĐÌNH THỊNH STUDIO</p>
          <h1 className="text-5xl lg:text-7xl leading-tight font-bold text-white">QUY TRÌNH CHỤP ẢNH</h1>
          <div className="relative aspect-[6/9] flex-shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105">
            <Image src={img} alt="procedure" fill className="object-cover" priority/>
          </div>
        </div>
        
        <div className="my-auto w-[22vw] space-y-12">
          <div className="relative aspect-[6/9] flex-shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105">
            <Image src={img2} alt="procedure" fill className="object-cover" priority/>
          </div>
          <p className="text-white text-base leading-relaxed">
            Quy trình của chúng tôi bắt đầu với việc lắng nghe sâu sắc ý tưởng và mong đợi của khách hàng. Chúng tôi tìm
            hiểu về cá nhân hóa và sở thích của họ để tạo ra một trải nghiệm chụp ảnh độc đáo và đáng nhớ.
          </p>
        </div>
        
        <div className="my-auto w-[22vw] space-y-4">
          <div className="relative aspect-[6/9] flex-shrink-0 overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105">
            <Image src={img3} alt="procedure" fill className="object-cover" priority/>
          </div>
        </div>
      </div>
    </div>
  )
}
