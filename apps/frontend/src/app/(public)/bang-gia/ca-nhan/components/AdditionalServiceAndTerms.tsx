'use client'
import DividerWithText from '@/app/components/common/DividerWithText'
import ServiceCategories from '../../components/ServiceCategories'
import { useState } from 'react'

interface ServiceItem {
  id: string
  title: string
  description: string
  isActive: boolean
}

interface ServiceSection {
  id: string
  title: string
  services: ServiceItem[]
}

interface AdditionalServiceAndTermsProps {
  service: ServiceSection[]
}

export default function AdditionalServiceAndTerms({ service }: Readonly<AdditionalServiceAndTermsProps>) {
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  const toggleAccordion = (id: string) => {
    setOpenAccordions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  return (
    <div className="">
      {service.map(item => (
        <div key={item.id} className="mb-8 space-y-8">
          <DividerWithText textClassName="text-[#888888] text-sm md:text-base" />
          <h2 className="text-2xl font-bold text-[#585858] md:text-4xl">{item.title}</h2>
          <ServiceCategories
            categories={item.services}
            openAccordions={openAccordions}
            onToggleAccordion={toggleAccordion}
          />
        </div>
      ))}
    </div>
  )
}
