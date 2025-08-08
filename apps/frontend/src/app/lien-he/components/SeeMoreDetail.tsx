import AnimatedContent from '@/app/components/common/AnimatedContent'
import Image, { StaticImageData } from 'next/image'
import Link from 'next/link'

interface SeeMoreDetailProps {
  imgSrc: string | StaticImageData
  title: string
  description: string
  linkUrl: string
  titleButton: string
  className?: string
}

export default function SeeMoreDetail({
  imgSrc,
  title,
  description,
  titleButton,
  className,
  linkUrl
}: Readonly<SeeMoreDetailProps>) {
  return (
    <div className={`relative h-[50vh] w-full overflow-hidden ${className}`}>
      <Image src={imgSrc} alt="SeeMoreDetail" className="h-full w-full object-cover" fill />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-white">
        <AnimatedContent direction="vertical" duration={1.5} threshold={-0.5}>
          <h1 className="mb-2 text-3xl font-bold">{title}</h1>
          <p className="mb-4 text-sm text-gray-200">{description}</p>
          <Link href={linkUrl}>
            <button className="rounded-xl border border-white bg-transparent px-6 py-1.5 text-white transition-all duration-300 hover:border-[#888888] hover:text-[#888888]">
              {titleButton}
            </button>
          </Link>
        </AnimatedContent>
      </div>
    </div>
  )
}
