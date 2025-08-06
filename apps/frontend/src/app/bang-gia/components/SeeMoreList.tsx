import { ChevronDown } from 'lucide-react'
import Link from 'next/link'

interface SeeMoreListProps {
  seeMoreList: {
    title: string
    href: string
  }[]
}
export default function SeeMoreList({ seeMoreList }: Readonly<SeeMoreListProps>) {
  return (
    <div>
      {seeMoreList.map((item) => (
        <Link key={item.href} href={item.href} className="flex items-center gap-2 text-[#585858]">
          <ChevronDown className="-rotate-90" size={20} />
          <span className="">{item.title}</span>
        </Link>
      ))}
    </div>
  )
}
