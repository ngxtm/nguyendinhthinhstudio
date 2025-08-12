import Image from 'next/image'
import img from '../images/svp.jpg'

export default function ServiceProcessComponnent() {
  return (
    <div className="min-h-screen px-4 py-8 md:px-8 lg:px-12 flex flex-col items-center justify-center">
      <div className="w-full max-w-7xl">
        {/* Mobile Layout - Single Column */}
        <div className="block md:hidden space-y-8">
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>1. LIÊN LẠC</p>
            <p className='text-[#888888] text-sm'>Liên hệ với Studio để nhận được tư vấn các gói từ chuyên viên CSKH</p>
          </div>
          
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>2. TƯ VẤN</p>
            <p className='text-[#888888] text-sm'>
              Nếu có nhu cầu tư vấn chuyên sâu, khách hàng sẽ được tư vấn bởi các chuyên gia trong lĩnh vực (Stylist,
              CD, Makeup,...)
            </p>
          </div>
          
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>3. ĐẶT LỊCH</p>
            <p className='text-[#888888] text-sm'>Khi chọn được các dịch vụ phù hợp, khách hàng tự do chọn ngày giờ chụp và thanh toán trước</p>
          </div>
          
          {/* Image in mobile */}
          <div className="relative aspect-[4/3] w-full max-w-sm mx-auto">
            <Image src={img} alt="svp" fill className="rounded-2xl object-cover" />
          </div>
          
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>4. &quot;ONSET&quot;</p>
            <p className='text-[#888888] text-sm'>Đến Studio theo hướng dẫn của CSKH và trải nghiệm tiền kỳ dịch vụ đã chọn</p>
          </div>
          
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>5. HẬU KỲ</p>
            <p className='text-[#888888] text-sm'>Nhận sự tư vấn và làm việc với các chuyên gia hậu kỳ về hình ảnh, video</p>
          </div>
          
          <div className='text-center'>
            <p className='text-2xl font-bold mb-2'>6. &quot;FINISH&quot;</p>
            <p className='text-[#888888] text-sm'>Nhận thành phẩm cuối cùng tại Studio hoặc theo hình thức Online</p>
          </div>
        </div>

        {/* Tablet Layout - 2 Columns */}
        <div className="hidden md:block lg:hidden">
          <div className="grid grid-cols-2 gap-8 items-start">
            <div className="space-y-8">
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>1. LIÊN LẠC</p>
                <p className='text-[#888888] text-sm'>Liên hệ với Studio để nhận được tư vấn các gói từ chuyên viên CSKH</p>
              </div>
              
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>2. TƯ VẤN</p>
                <p className='text-[#888888] text-sm'>
                  Nếu có nhu cầu tư vấn chuyên sâu, khách hàng sẽ được tư vấn bởi các chuyên gia trong lĩnh vực (Stylist,
                  CD, Makeup,...)
                </p>
              </div>
              
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>3. ĐẶT LỊCH</p>
                <p className='text-[#888888] text-sm'>Khi chọn được các dịch vụ phù hợp, khách hàng tự do chọn ngày giờ chụp và thanh toán trước</p>
              </div>
            </div>
            
            <div className="space-y-8">
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>4. &quot;ONSET&quot;</p>
                <p className='text-[#888888] text-sm'>Đến Studio theo hướng dẫn của CSKH và trải nghiệm tiền kỳ dịch vụ đã chọn</p>
              </div>
              
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>5. HẬU KỲ</p>
                <p className='text-[#888888] text-sm'>Nhận sự tư vấn và làm việc với các chuyên gia hậu kỳ về hình ảnh, video</p>
              </div>
              
              <div className='text-center'>
                <p className='text-2xl font-bold mb-2'>6. &quot;FINISH&quot;</p>
                <p className='text-[#888888] text-sm'>Nhận thành phẩm cuối cùng tại Studio hoặc theo hình thức Online</p>
              </div>
            </div>
          </div>
          
          {/* Image in tablet - centered below */}
          <div className="relative aspect-[3/4] w-full max-w-md mx-auto mt-8">
            <Image src={img} alt="svp" fill className="rounded-2xl object-cover" />
          </div>
        </div>

        {/* Desktop Layout - 3 Columns */}
        <div className="hidden lg:grid grid-cols-3 gap-8 items-start">
          <div className="grid grid-cols-1 content-around h-full">
            <div className='text-center'>
              <p className='text-3xl font-bold'>1. LIÊN LẠC</p>
              <p className='text-[#888888] text-base'>Liên hệ với Studio để nhận được tư vấn các gói từ chuyên viên CSKH</p>
            </div>
            
            <div className='text-center'>
              <p className='text-3xl font-bold'>2. TƯ VẤN</p>
              <p className='text-[#888888] text-base'>
                Nếu có nhu cầu tư vấn chuyên sâu, khách hàng sẽ được tư vấn bởi các chuyên gia trong lĩnh vực (Stylist,
                CD, Makeup,...)
              </p>
            </div>
            
            <div className='text-center'>
              <p className='text-3xl font-bold'>3. ĐẶT LỊCH</p>
              <p className='text-[#888888] text-base'>Khi chọn được các dịch vụ phù hợp, khách hàng tự do chọn ngày giờ chụp và thanh toán trước</p>
            </div>
          </div>
          
          <div className="relative aspect-[18/24] flex-shrink-0 flex justify-center">
            <Image src={img} alt="svp" fill className="rounded-2xl object-cover" />
          </div>
          
          <div className='grid grid-cols-1 content-around h-full'>
                          <div className='text-center'>
                <p className='text-3xl font-bold'>4. &quot;ONSET&quot;</p>
                <p className='text-[#888888] text-base'>Đến Studio theo hướng dẫn của CSKH và trải nghiệm tiền kỳ dịch vụ đã chọn</p>
              </div>
              
              <div className='text-center'>
                <p className='text-3xl font-bold'>5. HẬU KỲ</p>
                <p className='text-[#888888] text-base'>Nhận sự tư vấn và làm việc với các chuyên gia hậu kỳ về hình ảnh, video</p>
              </div>
              
              <div className='text-center'>
                <p className='text-3xl font-bold'>6. &quot;FINISH&quot;</p>
                <p className='text-[#888888] text-base'>Nhận thành phẩm cuối cùng tại Studio hoặc theo hình thức Online</p>
              </div>
          </div>
        </div>
      </div>
    </div>
  )
}
