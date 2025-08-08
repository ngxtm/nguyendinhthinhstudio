import SeeMoreDetail from './SeeMoreDetail'
import SeeMoreDetail1Img from '../images/seemore1.jpg'
import SeeMoreDetail2Img from '../images/seemore2.jpg'
import SeeMoreDetail3Img from '../images/seemore3.jpg'

interface SeeMoreProps {
  className?: string
}

export default function SeeMore({ className }: Readonly<SeeMoreProps>) {
  return (
    <div className={`grid grid-cols-1 gap-6 md:grid-cols-3 ${className}`}>
      <SeeMoreDetail
        imgSrc={SeeMoreDetail1Img}
        title="THƯ VIỆN"
        description="Thư viện ảnh tổng hợp hơn 1000 bộ hình, video"
        titleButton="Xem Thêm"
        linkUrl='/thu-vien'
      />
      <SeeMoreDetail
        imgSrc={SeeMoreDetail2Img}
        title="BẢNG GIÁ"
        description="Xem bảng giá tại Studio"
        titleButton="Xem Thêm"
        linkUrl='/bang-gia'
      />
      <SeeMoreDetail
        imgSrc={SeeMoreDetail3Img}
        title="DỊCH VỤ"
        description="Tìm hiểu về dịch vụ"
        titleButton="Xem Thêm"
        linkUrl='/dich-vu'
      />
    </div>
  )
}
