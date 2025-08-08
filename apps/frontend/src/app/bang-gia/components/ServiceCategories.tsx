'use client'
import { MdArrowDropDown } from 'react-icons/md'

interface Category {
  id: string
  title: string
  description: string
}

interface ServiceCategoriesProps {
  categories: Category[]
  openAccordions: Set<string>
  onToggleAccordion: (id: string) => void
  borderDisabled?: boolean
}

export default function ServiceCategories({ categories, openAccordions, onToggleAccordion, borderDisabled = false }: Readonly<ServiceCategoriesProps>) {
  return (
    <>
      {categories.map(category => (
        <div key={category.id} className={`overflow-hidden !mb-0 ${borderDisabled ? 'border-none' : 'border-b border-gray-300'}`}>
          <button
            onClick={() => onToggleAccordion(category.id)}
            className={`flex w-full items-center justify-between px-2 py-2.5 text-left transition-colors duration-200 ${
              openAccordions.has(category.id) ? 'border-none' : ''
            }`}
          >
            <span className="flex gap-1 w-full items-center font-bold text-[#585858] text-sm md:text-base">
              <span
                className={`inline-block text-2xl transition-transform duration-300 ${
                  openAccordions.has(category.id) ? '' : '-rotate-90'
                }`}
              >
                <MdArrowDropDown />
              </span>
              {category.title}
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-700 ease-in-out ${
              openAccordions.has(category.id) ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="px-4 pt-4 pb-6">
              {category.description ? (
                <p className="leading-relaxed text-gray-600">{category.description}</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">Nội dung chi tiết cho {category.title} sẽ được cập nhật sớm.</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-sm text-gray-700">Đang cập nhật</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
