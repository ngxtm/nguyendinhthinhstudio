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
        <DividerWithText
        text="QUY TRÌNH DỊCH VỤ"
        textClassName="text-[#888888] text-sm md:text-base"
        className="px-4 sm:px-6 md:px-8 lg:px-12"
      />
        <ServiceProcessComponnent />
      </div>
      <SeeMore className='px-4 sm:px-6 md:px-8 lg:px-12 mb-4' />
      <Footer />
    </>
  )
}
