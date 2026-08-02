'use client'

import { Fragment, useState } from 'react'
import { Combobox, Transition } from '@headlessui/react'
import { Check, ChevronsUpDown } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  parent?: {
    id: string
    name: string
    slug: string
  } | null
}

interface CategoryComboboxProps {
  categories: Category[]
  selected: Category[]
  onChange: (categories: Category[]) => void
  placeholder?: string
  label?: string
  required?: boolean
  disabled?: boolean
}

/**
 * CategoryCombobox Component
 * Dropdown có thể search cho category - hỗ trợ hiển thị parent
 */
export default function CategoryCombobox({
  categories,
  selected,
  onChange,
  placeholder = 'Chọn danh mục...',
  label,
  required = false,
  disabled = false
}: CategoryComboboxProps) {
  const [query, setQuery] = useState('')

  const filteredCategories =
    query === ''
      ? categories
      : categories.filter(cat =>
          cat.name.toLowerCase().includes(query.toLowerCase()) ||
          cat.slug.toLowerCase().includes(query.toLowerCase()) ||
          cat.parent?.name.toLowerCase().includes(query.toLowerCase())
        )

  function getDisplayName(category: Category): string {
    if (category.parent) {
      return `${category.parent.name} → ${category.name}`
    }
    return category.name
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <Combobox value={selected} onChange={onChange} multiple disabled={disabled}>
        <div className="relative">
          <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-gray-300 bg-white text-left focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
            <Combobox.Input
              className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:outline-none focus:ring-0 disabled:bg-gray-100 disabled:cursor-not-allowed"
              displayValue={(cats: Category[]) =>
                cats && cats.length > 0 ? cats.map(cat => getDisplayName(cat)).join(', ') : ''
              }
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
            />
            <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronsUpDown
                className="h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </Combobox.Button>
          </div>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery('')}
          >
            <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
              {filteredCategories.length === 0 && query !== '' ? (
                <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                  Không tìm thấy danh mục
                </div>
              ) : (
                <div>
                  {/* Category Options */}
                  {filteredCategories.map((category) => (
                    <Combobox.Option
                      key={category.id}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                        }`
                      }
                      value={category}
                    >
                      {({ selected, active }) => (
                        <>
                          <div>
                            <span className={`block ${selected ? 'font-medium' : 'font-normal'}`}>
                              {category.parent && (
                                <span className="text-gray-500 text-xs mr-1">
                                  {category.parent.name} →
                                </span>
                              )}
                              {category.name}
                            </span>
                            <span className="block text-xs text-gray-400 mt-0.5">
                              /{category.slug}
                            </span>
                          </div>
                          {selected ? (
                            <span
                              className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                active ? 'text-blue-600' : 'text-blue-600'
                              }`}
                            >
                              <Check className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Combobox.Option>
                  ))}
                </div>
              )}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>
      {selected.length > 0 && (
        <p className="mt-1 text-xs text-gray-500">
          Đã chọn:
          <span className="ml-1 flex flex-wrap gap-1">
            {selected.map(cat => (
              <span key={cat.id} className="rounded bg-gray-100 px-1 py-0.5">
                {cat.slug}
              </span>
            ))}
          </span>
        </p>
      )}
    </div>
  )
}
