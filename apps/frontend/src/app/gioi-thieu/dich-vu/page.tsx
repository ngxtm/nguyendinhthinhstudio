import Header from '@/app/components/layout/Header'
import ServiceComponent from './components/ServiceComponent'
import StylistComponent from './components/StylistComponent'
import MakeupComponent from './components/MakeupComponent'
import ImageProductionComponent from './components/ImageProductionComponent'
import CreativeDirectorComponent from './components/CreativeDirectorComponent'
import ServiceProcessComponnent from './components/ServiceProcessComponnent'
import DividerWithText from '@/app/components/common/DividerWithText'
import SeeMore from '@/app/lien-he/components/SeeMore'
import Footer from '@/app/components/common/Footer'
import AnimatedContent from '@/app/components/common/AnimatedContent'

export default function Service() {
  return (
    <>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-10 sm:pt-14">
        <ServiceComponent />
        <StylistComponent />
        <MakeupComponent />
        <ImageProductionComponent />
        <CreativeDirectorComponent />
        <AnimatedContent
          direction="horizontal"
          duration={1.5}
          distance={250}
          threshold={0.1}
          className="h-fit sm:h-full"
        >
          <DividerWithText
            text="QUY TRÌNH DỊCH VỤ"
            textClassName="text-[#888888] text-sm md:text-base"
            className="px-4 sm:px-6 md:px-8 lg:px-12"
          />
        </AnimatedContent>

        <ServiceProcessComponnent />
        <AnimatedContent
          direction="horizontal"
          reverse={true}
          duration={1.5}
          distance={250}
          threshold={0.1}
          className="h-fit sm:h-full"
        >
          <DividerWithText
            text="XEM THÊM"
            textClassName="text-[#888888] text-sm md:text-base"
            className="mb-10 px-4 sm:px-6 md:px-8 lg:px-12"
          />
        </AnimatedContent>
        <SeeMore className="mb-4 px-4 sm:px-6 md:px-8 lg:px-12" />
      </div>
      <Footer />
    </>
  )
}
