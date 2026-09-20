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
      {seeMoreList.map(item => (
        <Link key={item.title} href={item.href} className="flex items-center gap-2 text-[#585858] dark:text-neutral-300">
          <ChevronDown className="-rotate-90" size={20} />
          <span>{item.title}</span>
        </Link>
      ))}
    </div>
  )
}
