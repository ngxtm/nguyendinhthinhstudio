import Header from '@/app/components/layout/Header'
import ServiceComponent from './components/ServiceComponent'
import StylistComponent from './components/StylistComponent'
import MakeupComponent from './components/MakeupComponent'
import ImageProductionComponent from './components/ImageProductionComponent'

export default function Service() {
  return (
    <>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-10 sm:pt-14">
        <ServiceComponent />
        <StylistComponent />
        <MakeupComponent />
        <ImageProductionComponent />
      </div>
    </>
  )
}
