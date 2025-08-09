import Header from "@/app/components/layout/Header";
import Image from "next/image";

export default function Policy() {
  return (
    <div className="space-y-10 px-2.5 md:px-16">
        <Header logoText="NguyenDinhThinh" showMobileMenu={true} />
        <div className="pt-10 sm:pt-14">
            {/* <Image src={chinhSachImg} alt="chinh-sach" /> */}
        </div>
    </div>
  );
}