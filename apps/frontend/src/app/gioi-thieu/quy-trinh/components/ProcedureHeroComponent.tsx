import Image from 'next/image'
import img from '../images/p1.jpg'
import img2 from '../images/p2.jpg'
import img3 from '../images/p3.jpg'

export default function ProcedureHeroComponent() {
  return (
    <div className="flex min-h-screen flex-col justify-center gap-6 md:gap-10 bg-black md:flex-row py-10 md:py-30 px-4 md:px-8">
      <div className="my-auto w-full md:w-[22vw] space-y-4 md:space-y-6">
        <p className="pb-3 md:pb-6 text-xs md:text-sm text-[#686868]">NGUYỄN ĐÌNH THỊNH STUDIO</p>
        <h1 className="text-3xl md:text-5xl lg:text-6xl leading-tight font-bold text-white">QUY TRÌNH DỊCH VỤ</h1>
        <div className="relative aspect-[6/9] md:aspect-[6/9] flex-shrink-0 overflow-hidden rounded-xl md:rounded-2xl transition-all duration-300 hover:scale-105">
          <Image src={img} alt="procedure" fill className="object-cover" />
        </div>
      </div>
      
      <div className="my-auto w-full md:w-[22vw] space-y-6 md:space-y-12">
        <div className="relative aspect-[6/9] md:aspect-[6/9] flex-shrink-0 overflow-hidden rounded-xl md:rounded-2xl transition-all duration-300 hover:scale-105">
          <Image src={img2} alt="procedure" fill className="object-cover" />
        </div>
        <p className="text-white text-sm md:text-base leading-relaxed">
          Quy trình của chúng tôi bắt đầu với việc lắng nghe sâu sắc ý tưởng và mong đợi của khách hàng. Chúng tôi tìm
          hiểu về cá nhân hóa và sở thích của họ để tạo ra một trải nghiệm chụp ảnh độc đáo và đáng nhớ.
        </p>
      </div>
      
      <div className="my-auto w-full md:w-[22vw] space-y-4">
        <div className="relative aspect-[6/9] md:aspect-[6/9] flex-shrink-0 overflow-hidden rounded-xl md:rounded-2xl transition-all duration-300 hover:scale-105">
          <Image src={img3} alt="procedure" fill className="object-cover" />
        </div>
      </div>
    </div>
  )
}
