import DividerWithText from './components/common/DividerWithText'
import Header from './components/layout/Header'
import AppHero from './components/layout/Hero'
import TwoLayoutSection from './components/layout/TwoLayout'

import imgtwolayout1 from './images/twolayout.png'
import imgtwolayout2 from './images/twolayout-2.png'
import imgtwolayout3 from './images/twolayout-3.png'
import imgtwolayout4 from './images/twolayout-4.png'
import feature from './images/feature.png'
import oneLayoutImgSrc from './images/onelayout.png'
import ServiceOverview from './components/layout/ServiceOverview'
import Footer from './components/common/Footer'
import AnimatedContent from './components/common/AnimatedContent'
import SocialSection from './components/common/SocialSection'
import OneLayoutSection from './components/layout/OneLayout'

export default function Home() {
  return (
    <div className="[&>*:nth-child(n+3)]:mt-6">
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <AppHero autoPlayInterval={3200} />
      <OneLayoutSection imgSrc={oneLayoutImgSrc} title="NEW COLLECTION" titleButton="KHÁM PHÁ NGAY" />
      <AnimatedContent direction="horizontal" reverse={true} duration={1.8} distance={160}>
        <DividerWithText text="HOT & TRENDING" textClassName="text-[#cccccc] text-sm" className="mt-10" />
      </AnimatedContent>
      <TwoLayoutSection
        pic1src={imgtwolayout1}
        pic1title="KHÁM PHÁ BỘ ẢNH"
        pic1titleButton="DỄ THƯƠNG"
        pic2src={imgtwolayout2}
        pic2title="KHÁM PHÁ BỘ ẢNH"
        pic2titleButton="CÁ TÍNH"
        pic1width={550}
        pic1height={700}
        pic2width={550}
        pic2height={700}
        containerGap={24}
      />
      <TwoLayoutSection
        pic1src={imgtwolayout3}
        pic1title="KHÁM PHÁ BỘ ẢNH"
        pic1titleButton="SANG TRỌNG"
        pic2src={imgtwolayout4}
        pic2title="KHÁM PHÁ BỘ ẢNH"
        pic2titleButton="SLAY"
        pic1width={550}
        pic1height={800}
        pic2width={550}
        pic2height={800}
        containerGap={24}
      />
      <AnimatedContent direction="horizontal" reverse={true} duration={1.8} delay={0.3}>
        <DividerWithText text="FEATURED" textClassName="text-[#cccccc] text-sm" className="mt-10" />
      </AnimatedContent>
      <OneLayoutSection imgSrc={feature} title="READY TO SHOOT" titleButton="BOOKING NOW" />
      <AnimatedContent distance={150} direction="horizontal" reverse={true} duration={1.8} delay={0.3}>
        <DividerWithText text="FEATURED" textClassName="text-[#cccccc] text-sm" className="mt-10" />
      </AnimatedContent>

      <ServiceOverview />
      <SocialSection />
      <Footer />
    </div>
  )
}
