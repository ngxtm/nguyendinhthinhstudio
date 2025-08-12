import Image from 'next/image'
import img1 from '../images/ip-1.jpg'
import img2 from '../images/ip-2.jpg'
import img3 from '../images/ip-3.jpg'

export default function ImageProductionComponent() {
  return (
    <div className="min-h-screen space-y-12 px-4 sm:px-6 md:px-8 lg:px-12">
      <div className="text-center">
        <p className="text-sm tracking-wide text-[#888888]">ĐỘI SẢN XUẤT HÌNH ẢNH</p>
        <h2 className="text-4xl leading-tight font-bold sm:text-5xl lg:text-6xl xl:text-7xl">Image Production</h2>
      </div>
      <div className="grid auto-rows-fr grid-cols-1 sm:grid-cols-3">
        <div className="relative aspect-[16/10] flex-shrink-0">
          <Image src={img1} alt="ip-1" fill className="rounded-2xl object-cover" />
        </div>
        <div className="my-auto space-y-4 text-center">
          <p className="text-2xl font-bold">
            Lighting Setup <br /> (Chuyên Gia Ánh Sáng)
          </p>
          <p className="px-8 text-sm text-[#929292]">
            Trong Studio thì ánh sáng là rất quan trọng để có một bộ hình đẹp. Với việc sử dụng những thiết bị hiện đại
            nhất và khả năng điều chỉnh được mọi loại ánh sáng, người điều chỉnh ánh sáng của Tran Vu Bang Studio góp
            phần không nhỏ để tạo ra những bức ảnh chuẩn từ hình gốc
          </p>
        </div>
        <div className="relative aspect-[16/10] flex-shrink-0">
          <Image src={img2} alt="ip-1" fill className="rounded-2xl object-cover" />
        </div>
        <div className="my-auto space-y-4 text-center">
          <p className="text-2xl font-bold">
            Photographer <br /> (Chuyên Gia Chụp Ảnh)
          </p>
          <p className="px-8 text-sm text-[#929292]">
            Photographer chính là người sẽ bấm máy, bắt lấy khoảnh khắc đẹp của nhân vật và quyết định bức ảnh có đạt đủ
            chuẩn hay chưa. Với sự hỗ trợ tuyệt đối từ các bộ phận khác, thiết bị tối tân và kinh nghiệm, kiến thức của
            chuyên gia, chắc chắn sẽ không bỏ lỡ bất kỳ giây phút thần thái nào.
          </p>
        </div>
        <div className="relative aspect-[16/10] flex-shrink-0">
          <Image src={img3} alt="ip-1" fill className="rounded-2xl object-cover" />
        </div>
        <div className="my-auto space-y-4 text-center">
          <p className="text-2xl font-bold">
            Retoucher <br /> (Chuyên Gia Sửa Ảnh)
          </p>
          <p className="px-8 text-sm text-[#929292]">
            Với việc cập nhật các công nghệ chỉnh sửa ảnh hiện đại nhất trên thế giới và sự hỗ trợ của các thiết bị,
            phần mềm chỉnh sửa ảnh tốt nhất. Retoucher sẽ làm việc, tư vấn, thảo luận cùng khách hàng để tìm ra hướng
            chỉnh sửa bức ảnh phù hợp, đẹp, chuẩn nhất, từ đó cho ra đời bộ ảnh “như ý muốn”
          </p>
        </div>
      </div>
    </div>
  )
}
