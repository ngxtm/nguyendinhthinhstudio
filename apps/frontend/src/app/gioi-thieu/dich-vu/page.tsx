import Header from '@/app/components/layout/Header'
import ServiceComponent from './components/ServiceComponent'
import StylistComponent from './components/StylistComponent'

export default function Service() {
  return (
    <>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-10 sm:pt-14">
        <ServiceComponent />
        <StylistComponent />
      </div>
    </>
  )
}
