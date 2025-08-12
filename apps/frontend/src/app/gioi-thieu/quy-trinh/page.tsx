import Header from '@/app/components/layout/Header'
import ProcedureHeroComponent from './components/ProcedureHeroComponent'

export default function Procedure() {
  return (
    <>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-10 sm:pt-14">
        <ProcedureHeroComponent />
      </div>
    </>
  )
}
