import Image, { StaticImageData } from 'next/image'

interface MiddleProcedureProps {
  leftImage: string | StaticImageData
  rightImage: string | StaticImageData
  title: string
  description: string
  number: string
}

export default function MiddleProcedure({
  leftImage,
  rightImage,
  title,
  description,
  number
}: Readonly<MiddleProcedureProps>) {
  return (
    <div className="bg-[#f2f5f7] dark:bg-neutral-900">
      <div className="hidden h-screen flex-row md:flex">
        <div className="aspect-[3/4]flex-shrink-0 relative overflow-hidden md:w-1/3">
          <Image src={leftImage} alt="procedure" fill className="object-cover" />
        </div>
        <div className="my-auto flex w-1/3 flex-col gap-4 px-14 md:flex-row">
          <p className="font-montserrat my-auto text-9xl font-bold text-[#d8d8d8]">{number}</p>
          <div className="flex flex-col gap-2.5">
            <h2 className="text-4xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
            <p className="text-base leading-relaxed text-gray-600 dark:text-gray-300">{description}</p>
          </div>
        </div>
        <div className="relative aspect-[3/4] flex-shrink-0 overflow-hidden md:w-1/3">
          <Image src={rightImage} alt="procedure" fill className="object-cover" />
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
    </div>
  )
}
