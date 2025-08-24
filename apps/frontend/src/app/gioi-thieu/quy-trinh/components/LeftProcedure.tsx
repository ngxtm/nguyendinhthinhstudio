import Image, { StaticImageData } from 'next/image'

interface LeftProcedureProps {
  image: string | StaticImageData
  title: string
  description: string
  number: string
}

export default function LeftProcedure({ title, description, image, number }: Readonly<LeftProcedureProps>) {
  return (
    <div className="flex h-screen w-full flex-row bg-[#f2f5f7]">
      <div className="my-auto flex w-2/3 flex-col justify-center items-center gap-16 px-20 md:flex-row">
        <p className="font-montserrat my-auto text-9xl font-bold text-[#d8d8d8]">{number}</p>
        <div className="flex flex-col gap-6">
          <h2 className="text-6xl font-bold text-gray-800">{title}</h2>
          <p className="max-w-2xl text-base leading-relaxed text-gray-600">{description}</p>
        </div>
      </div>
      <div className="relative aspect-[3/4] flex-shrink-0 overflow-hidden md:w-1/3">
        <Image src={image} alt="procedure" fill className="object-cover" />
      </div>
    </div>
  )
}
