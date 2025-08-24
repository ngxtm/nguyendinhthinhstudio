import Image, { StaticImageData } from 'next/image'



interface MiddleProcedureProps {
    leftImage: string | StaticImageData
    rightImage: string | StaticImageData
    title: string
    description: string
    number: string
}

export default function MiddleProcedure({ leftImage, rightImage, title, description, number }: Readonly<MiddleProcedureProps>) {
  return (
    <div className="flex h-screen w-full flex-row bg-[#f2f5f7]">
      <div className="aspect-[3/4]flex-shrink-0 relative overflow-hidden md:w-1/3">
        <Image src={leftImage} alt="procedure" fill className="object-cover" />
      </div>
      <div className="my-auto flex w-1/3 flex-col gap-4 px-14 md:flex-row">
        <p className="text-8xl font-bold text-[#d8d8d8] my-auto font-montserrat">{number}</p>
        <div className="flex flex-col gap-2.5">
          <h2 className="text-4xl font-bold text-gray-800 ">
            {title}
          </h2>
          <p className="text-base leading-relaxed text-gray-600">
            {description}
          </p>
        </div>
      </div>
      <div className="relative aspect-[3/4] flex-shrink-0 overflow-hidden md:w-1/3">
        <Image src={rightImage} alt="procedure" fill className="object-cover" />
      </div>
    </div>
  )
}
