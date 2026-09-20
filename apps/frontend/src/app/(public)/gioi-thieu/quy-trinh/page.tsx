import Image from 'next/image'
import ProcedureHeroComponent from './components/ProcedureHeroComponent'
import MiddleProcedure from './components/MiddleProcedure'
import RightProcedure from './components/RightProcedure'
import LeftProcedure from './components/LeftProcedure'

import img from './images/qt-1.jpg'
import pic02l from './images/qt-2.1.jpg'
import pic02r from './images/qt-2.2.jpg'
import pic03 from './images/qt-3.jpg'
import pic04 from './images/qt-4.jpg'
import pic05 from './images/qt-5.jpg'
import pic06l from './images/qt-6.1.jpg'
import pic06r from './images/qt-6.2.jpg'
import pic07 from './images/qt-7.jpg'
import pic08 from './images/qt-8.jpg'
import pic09 from './images/qt-9.jpg'
import pic10 from './images/qt-10.jpg'
import pic11 from './images/qt-11.jpg'
import { createPublicMetadata } from '@/lib/seo'

export const metadata = createPublicMetadata({
  title: 'Quy trình chụp ảnh chuyên nghiệp | NDT Studio',
  description: 'Tham khảo quy trình phục vụ, chuẩn bị, chụp và hậu kỳ hình ảnh chuyên nghiệp tại NDT Studio.',
  path: '/gioi-thieu/quy-trinh'
})

export default function Procedure() {
  return (
    <div className="pt-10 sm:pt-14">
      <ProcedureHeroComponent />
      {/* 01 */}
      <div className="my-10 flex max-h-screen flex-col items-center justify-center gap-8 px-4 md:flex-row md:px-8">
        {/* Number - Mobile: smaller, Desktop: large */}
        <p className="font-montserrat text-9xl font-bold text-[#d8d8d8]">01</p>

        {/* Content - Mobile: full width, Desktop: limited width */}
        <div className="w-full space-y-4 md:max-w-1/3">
          <h2 className="text-5xl font-bold text-gray-800 dark:text-gray-100">TIẾP ĐÓN KHÁCH HÀNG</h2>
          <p className="text-base leading-relaxed text-gray-600 dark:text-gray-300">
            Khách hàng sẽ được đón tiếp và hướng dẫn vào khu vực phòng chờ của studio trước khi vào set chụp. Vì các khu
            vực trong stu khá rộng và từng khu vực đều hoạt động trong quá trình vận hành nên khách hàng cũng sẽ có
            những khu vực đặc thù dành riêng trong lúc chờ đợi để được thoải mái nhất.
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
      <RightProcedure
        number="03"
        title="CHỤP ẢNH"
        description="Chuyên viên Make Up và Hair Stylist sẽ tiến hành make up và làm tóc cho khách hàng. Thời gian cho Make up & Làm tóc sẽ dao động trong vòng 2 tiếng."
        image={pic03}
      />
      <LeftProcedure
        number="04"
        title="TEST ĐÈN"
        description="Khi make up và làm tóc hoàn tất, chuyên viên Lighting sẽ thực hiện kiểm tra ánh sáng để đảm bảo rằng khách hàng sẽ có được những bức ảnh đẹp nhất trong quá trình chụp. Chuyên viên Lighting, Photo và Retouch sẽ cùng nhau test đèn trong giai đoạn này để thảo luận mang đến một bộ hình đẹp nhất cho khách hàng."
        image={pic04}
      />
      <RightProcedure
        number="05"
        title="ON SET"
        description="Tiếp theo, chúng tôi mang đến một quá trình chụp ảnh chuyên nghiệp và tận hưởng. Với sự hỗ trợ của đội ngũ nhiếp ảnh gia tài năng và trang thiết bị hiện đại, chúng tôi tạo ra những bức ảnh chất lượng cao, với ánh sáng tốt nhất và các góc chụp độc đáo. Thời gian chụp sẽ dao động trong vòng 45 phút – 1 tiếng."
        image={pic05}
      />
      <MiddleProcedure
        number="06"
        title="CHỈNH TÓC, MAKEUP TRONG SET CHỤP"
        description="Trong quá trình chụp, chuyên viên Make-Up & Làm Tóc sẽ tiếp tục theo dõi và chỉnh sửa kiểu tóc cũng như lớp trang điểm để đảm bảo rằng khách hàng luôn xinh đẹp nhất."
        leftImage={pic06l}
        rightImage={pic06r}
      />
      <LeftProcedure
        number="07"
        title="TAKE CARE TRONG SET CHỤP"
        description="Stylist sẽ luôn take care khách hàng trong quá trình chụp để đảm bảo rằng khách hàng luôn cảm thấy thoải mái và nhận được sự hỗ trợ từ ekip bất cứ lúc nào."
        image={pic07}
      />
      <RightProcedure
        number="08"
        title="STYLIST HƯỚNG DẪN TẠO DÁNG"
        description="Chuyên viên tạo dáng chuyên nghiệp này sẽ hướng dẫn cũng như giúp khách hàng có được những pose dáng đẹp nhất, thần thái và chuyên nghiệp nhất."
        image={pic08}
      />
      <LeftProcedure
        number="09"
        title="CHỌN LỌC HÌNH ẢNH"
        description="Chúng tôi luôn lắng nghe và tạo dựng mối quan hệ gần gũi với khách hàng để đảm bảo rằng mỗi buổi chụp đều phản ánh đúng bản sắc và cá nhân của họ. Chuyên viên chăm sóc khách hàng những người có chuyên môn trong lĩnh vực sẽ chọn lọc ra những hình ảnh đẹp nhất để trình cho khách hàng. Từ đó họ sẽ dễ dàng chọn lựa ra những bức ảnh ưng ý và theo mong muốn của bản thân."
        image={pic09}
      />
      <RightProcedure
        number="10"
        title="DEMO HÌNH ẢNH"
        description="Sau khi buổi chụp kết thúc, khách hàng sẽ chọn một bức ảnh bất kỳ để làm mẫu và chỉnh sửa. Chuyên viên Retouch dành thời gian để chỉnh sửa và tạo hiệu ứng chuyên nghiệp cho từng bức ảnh theo yêu cầu và mong muốn của khách."
        image={pic10}
      />
      <LeftProcedure
        number="11"
        title="FINAL"
        description="Nhận thành phẩm cuối cùng theo hình Offline hoặc Online."
        image={pic11}
      />
    </div>
  )
}
