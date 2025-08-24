import Image, { StaticImageData } from "next/image";

interface RightProcedureProps {
    image: string | StaticImageData
    title: string
    description: string
    number: string
}

export default function RightProcedure({ image, title, description, number }: Readonly<RightProcedureProps>) {
  return (
    <div className="flex h-screen w-full flex-row">
      <div className="aspect-[3/4] flex-shrink-0 relative overflow-hidden md:w-1/3">
        <Image src={image} alt="procedure" fill className="object-cover" />
      </div>
      <div className="my-auto flex w-2/3 flex-col gap-16 justify-center items-center px-20 md:flex-row">
        <p className="my-auto text-9xl font-bold text-[#d8d8d8] font-montserrat">{number}</p>
        <div className="flex flex-col gap-6">
          <h2 className="text-6xl font-bold text-gray-800">{title}</h2>
          <p className="text-base leading-relaxed text-gray-600 max-w-2xl">{description}</p>
        </div>
      </div>
    </div>
  )
}
