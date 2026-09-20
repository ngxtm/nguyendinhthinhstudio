import Image, { StaticImageData } from 'next/image'
import SeeMoreList from './SeeMoreList'
import Link from 'next/link'

interface ServiceCardProps {
  id: string
  title: string
  description: string
  imageSrc: StaticImageData
  imageAlt: string
  imageWidth?: string
  seeMoreList: {
    title: string
    href: string
  }[]
}

export default function ServiceCard({
  id,
  title,
  description,
  imageSrc,
  seeMoreList,
  imageAlt,
  imageWidth = 'md:w-[35vw] lg:w-[40vw]'
}: Readonly<ServiceCardProps>) {
  return (
    <div className={`flex flex-col items-center gap-12 md:gap-52 md:flex-row`}>
      <div className="flex flex-col gap-6 md:gap-12">
        <h1 className="text-3xl font-bold text-[#585858] dark:text-neutral-300">{title}</h1>
        <div className="h-px w-14 border border-b-2 border-[#bdbdbd]" />
        <p className="text-[15px] leading-relaxed">{description}</p>
        <SeeMoreList seeMoreList={seeMoreList} />
        <Link href={`/bang-gia/${id}`} className="w-fit rounded-sm bg-[#cccccc] dark:bg-neutral-800 px-5 md:py-1.5 text-sm text-white flex items-center">
          Xem Bảng Giá
        </Link>
      </div>
      <div className={`relative w-full ${imageWidth} group h-[75vh] overflow-hidden rounded-4xl shadow-lg md:h-[75vh]`}>
        <Image
          alt={imageAlt}
          src={imageSrc}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-125"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>
    </div>
  )
}
