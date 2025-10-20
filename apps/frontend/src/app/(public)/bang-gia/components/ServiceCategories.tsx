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

export default function ServiceCategories({
  categories,
  openAccordions,
  onToggleAccordion,
  borderDisabled = false
}: Readonly<ServiceCategoriesProps>) {
  return (
    <>
      {categories.map(category => (
        <div
          key={category.id}
          className={`!mb-0 overflow-hidden ${borderDisabled ? 'border-none' : 'border-b border-gray-300'}`}
        >
          <button
            onClick={() => onToggleAccordion(category.id)}
            className={`flex w-full items-center justify-between px-2 py-2.5 text-left transition-colors duration-200 ${
              openAccordions.has(category.id) ? 'border-none' : ''
            }`}
          >
            <span className="flex w-full items-center gap-1 text-sm font-bold text-[#585858] md:text-base">
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
                <div className="leading-relaxed whitespace-pre-line text-gray-600">
                  {category.description.split('\n').map(line => {
                    const trimmedLine = line.trim()
                    if (trimmedLine.startsWith('•')) {
                      return (
                        <div key={line} className="mb-1 flex items-center gap-2">
                          <span className="text-gray-500">•</span>
                          <span>{trimmedLine.replace(/^•\s*/, '')}</span>
                        </div>
                      )
                    }

                    if (line.includes('XEM THÊM')) {
                      const parts = line.split('XEM THÊM')
                      return (
                        <div key={line}>
                          {parts[0]}
                          <a
                            href="/lien-he#ho-tro-nhanh"
                            className="inline-flex items-center gap-1 font-medium text-blue-600 underline transition-colors hover:text-blue-800"
                          >
                            XEM THÊM
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                          {parts[1]}
                        </div>
                      )
                    }

                    return <div key={line}>{line}</div>
                  })}
                </div>
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
