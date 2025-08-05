import DividerWithText from './components/common/DividerWithText'
import Header from './components/layout/Header'
import AppHero from './components/layout/Hero'
import TwoLayoutSection from './components/layout/TwoLayout'

import imgtwolayout1 from './images/twolayout.jpg'
import imgtwolayout2 from './images/twolayout-2.jpg'
import imgtwolayout3 from './images/twolayout-3.jpg'
import imgtwolayout4 from './images/twolayout-4.jpg'
import feature from './images/feature.png'
import oneLayoutImgSrc from './images/onelayout.jpg'
import ServiceOverview from './components/layout/ServiceOverview'
import Footer from './components/common/Footer'
import AnimatedContent from './components/common/AnimatedContent'
import SocialSection from './components/common/SocialSection'
import OneLayoutSection from './components/layout/OneLayout'

export default function Home() {
  return (
    <div>
      <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
      <div className="pt-16 sm:pt-16">
        <AppHero />
        <div className="space-y-6 sm:space-y-8 md:space-y-10 lg:space-y-12">
          <div className="mt-6 sm:mt-8 md:mt-10">
            <OneLayoutSection imgSrc={oneLayoutImgSrc} title="NEW COLLECTION" titleButton="KHÁM PHÁ NGAY" />
          </div>
          <AnimatedContent direction="horizontal" reverse={true} distance={500}>
            <DividerWithText
              text="HOT & TRENDING"
              textClassName="text-[#cccccc] text-sm"
              className="mt-6 sm:mt-8 md:mt-10 px-6 md:px-16"
            />
          </AnimatedContent>
          <div className="space-y-6 sm:space-y-8 md:space-y-5">
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
              containerGap={16}
              mobileStackVertical={true}
            />
            <TwoLayoutSection
              pic1src={imgtwolayout3}
              pic1title="KHÁM PHÁ BỘ ẢNH"
              pic1titleButton="HOÁ TRANG"
              pic2src={imgtwolayout4}
              pic2title="KHÁM PHÁ BỘ ẢNH"
              pic2titleButton="SLAY"
              pic1width={550}
              pic1height={800}
              pic2width={550}
              pic2height={800}
              containerGap={16}
              mobileStackVertical={true}
            />
          </div>
          <AnimatedContent direction="horizontal" distance={500} reverse={true} duration={1} delay={0.3}>
            <DividerWithText text="FEATURED" textClassName="text-[#cccccc] text-sm" className="mt-6 sm:mt-8 md:mt-10 px-6 md:px-16" />
          </AnimatedContent>
          <AnimatedContent distance={200} direction="vertical" duration={1.5} delay={0.3}>
            <OneLayoutSection imgSrc={feature} title="READY TO SHOOT" titleButton="BOOKING NOW" />
          </AnimatedContent>
          <div className="space-y-6 sm:space-y-8">
            <ServiceOverview />
            <SocialSection />
          </div>
          <Footer />
        </div>
      </div>
    </div>
  )
}
