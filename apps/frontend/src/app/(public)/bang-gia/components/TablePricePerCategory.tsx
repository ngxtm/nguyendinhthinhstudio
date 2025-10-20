import { cardList } from '../data/bang-gia'
import ServiceCard from './ServiceCard'

export default function TablePricePerCategory() {
  return (
    <div className='space-y-40 md:space-y-52'>
      {cardList.map((card) => (
        <ServiceCard key={card.id} {...card}/>
      ))}
    </div>
  )
}
