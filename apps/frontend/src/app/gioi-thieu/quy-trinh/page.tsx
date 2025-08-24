import Header from '@/app/components/layout/Header'
import ProcedureHeroComponent from './components/ProcedureHeroComponent'
import Image from 'next/image'
import img from './images/qt-1.jpg'
import MiddleProcedure from './components/MiddleProcedure'
import pic02l from './images/qt-2.1.jpg'
import pic02r from './images/qt-2.2.jpg'
export default function Procedure() {
  return (
    <>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-10 sm:pt-14">
        <ProcedureHeroComponent />
        {/* 01 */}
        <div className="my-10 flex max-h-screen flex-col items-center justify-center gap-8 px-4 md:flex-row md:px-8">
          {/* Number - Mobile: smaller, Desktop: large */}
          <p className="text-9xl font-bold text-[#d8d8d8]">01</p>

          {/* Content - Mobile: full width, Desktop: limited width */}
          <div className="w-full space-y-4 md:max-w-1/3">
            <h2 className="text-5xl font-bold text-gray-800">TIẾP ĐÓN KHÁCH HÀNG</h2>
            <p className="text-base leading-relaxed text-gray-600">
              Khách hàng sẽ được đón tiếp và hướng dẫn vào khu vực phòng chờ của studio trước khi vào set chụp. Vì các
              khu vực trong stu khá rộng và từng khu vực đều hoạt động trong quá trình vận hành nên khách hàng cũng sẽ
              có những khu vực đặc thù dành riêng trong lúc chờ đợi để được thoải mái nhất.
            </p>
          </div>

          {/* Image - Mobile: moderate height, Desktop: full screen height */}
          <div className="relative aspect-[3/4] w-80 flex-shrink-0 overflow-hidden rounded-xl md:w-1/4">
            <Image src={img} alt="procedure" fill className="object-cover" />
          </div>
        </div>

        <MiddleProcedure
          number="02"
          title="MAKEUP & LÀM TÓC"
          description="Chuyên viên Make Up và Hair Stylist sẽ tiến hành make up và làm tóc cho khách hàng. Thời gian cho Make up & Làm tóc sẽ dao động trong vòng 2 tiếng."
          leftImage={pic02l}
          rightImage={pic02r}
        />
      </div>
    </>
  )
}
