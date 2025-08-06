import Image, { StaticImageData } from 'next/image'
import SeeMoreList from './SeeMoreList'

interface ServiceCardProps {
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
  title, 
  description, 
  imageSrc, 
  seeMoreList, 
  imageAlt,
  imageWidth = "md:w-[35vw] lg:w-[40vw]"
}: Readonly<ServiceCardProps>) {
  return (
    <div className={`flex flex-col gap-52 md:flex-row items-center`}>
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-[#585858]">{title}</h1>
        <div className="h-px w-14 border border-b-2 border-[#bdbdbd]" />
        <p className="text-[15px] leading-relaxed">
          {description}
        </p>
        <SeeMoreList seeMoreList={seeMoreList} />
      </div>
      <div className={`relative w-full ${imageWidth} h-64 md:h-[75vh] overflow-hidden shadow-lg group rounded-4xl`}>
        <Image
          alt={imageAlt}
          src={imageSrc}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
    </div>
  )
}