import Image, { StaticImageData } from 'next/image'

interface RightProcedureProps {
  image: string | StaticImageData
  title: string
  description: string
  number: string
}

export default function RightProcedure({ image, title, description, number }: Readonly<RightProcedureProps>) {
  return (
    <>
      <div className="hidden h-screen flex-row md:flex">
        <div className="relative aspect-[3/4] flex-shrink-0 overflow-hidden md:w-1/3">
          <Image src={image} alt="procedure" fill className="object-cover" />
        </div>
        <div className="my-auto flex w-2/3 flex-col items-center justify-center gap-16 px-20 md:flex-row">
          <p className="font-montserrat my-auto text-9xl font-bold text-[#d8d8d8]">{number}</p>
          <div className="flex flex-col gap-6">
            <h2 className="text-6xl font-bold text-gray-800">{title}</h2>
            <p className="max-w-2xl text-base leading-relaxed text-gray-600">{description}</p>
          </div>
        </div>
      </div>

      <div className="relative min-h-[25vh] md:hidden border-b">
        <p className="font-montserrat absolute top-0 bottom-0 left-0 flex w-full items-center justify-center text-9xl font-bold text-[#d8d8d8]">
          {number}
        </p>
        <div className="absolute top-0 bottom-0 left-0 flex h-full w-full flex-col items-start justify-center gap-2.5 px-6">
          <p className="text-3xl font-bold">{title}</p>
          <p className="text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </>
  )
}
