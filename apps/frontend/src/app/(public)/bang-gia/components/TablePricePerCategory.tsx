import { createPricingCardList } from '../data/bang-gia'
import ServiceCard from './ServiceCard'

export default function TablePricePerCategory({ publicCategorySlugs }: { publicCategorySlugs: string[] }) {
  const cardList = createPricingCardList(new Set(publicCategorySlugs))

  return (
    <div className="space-y-40 md:space-y-52">
      {cardList.map(card => (
        <ServiceCard key={card.id} {...card} />
      ))}
    </div>
  )
}
