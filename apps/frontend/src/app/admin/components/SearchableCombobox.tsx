'use client'

import { Fragment, useState } from 'react'
import { Combobox, Transition } from '@headlessui/react'
import { Check, ChevronsUpDown } from 'lucide-react'

interface Option {
  id: string
  name: string
  slug: string
}

interface SearchableComboboxProps {
  options: Option[]
  selected: Option | null
  onChange: (option: Option | null) => void
  placeholder?: string
  label?: string
  disabled?: boolean
}

/**
 * SearchableCombobox Component
 * Dropdown có thể search - dùng cho parent tag selector
 */
export default function SearchableCombobox({
  options,
  selected,
  onChange,
  placeholder = 'Chọn...',
  label,
  disabled = false
}: SearchableComboboxProps) {
  const [query, setQuery] = useState('')

  const filteredOptions =
    query === ''
      ? options
      : options.filter(option =>
          option.name.toLowerCase().includes(query.toLowerCase()) ||
          option.slug.toLowerCase().includes(query.toLowerCase())
        )

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <Combobox value={selected} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-gray-300 bg-white text-left focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
            <Combobox.Input
              className="w-full border-none py-2 pl-3 pr-10 text-sm leading-5 text-gray-900 focus:outline-none focus:ring-0 disabled:bg-gray-100 disabled:cursor-not-allowed"
              displayValue={(option: Option | null) => option?.name ?? ''}
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
              {filteredOptions.length === 0 && query !== '' ? (
                <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                  Không tìm thấy kết quả
                </div>
              ) : (
                [
                  <Combobox.Option
                    key="none-option"
                    value={null}
                    className={({ active }) =>
                      `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                        active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                      }`
                    }
                  >
                    {({ selected, active }) => (
                      <>
                        <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                          (Không chọn)
                        </span>
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
                  </Combobox.Option>,
                  ...filteredOptions.map((option) => (
                    <Combobox.Option
                      key={option.id}
                      className={({ active }) =>
                        `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                          active ? 'bg-blue-100 text-blue-900' : 'text-gray-900'
                        }`
                      }
                      value={option}
                    >
                      {({ selected, active }) => (
                        <>
                          <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                            {option.name}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {option.slug}
                          </span>
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
                  )),
                ]
              )}
            </Combobox.Options>
          </Transition>
        </div>
      </Combobox>
      {selected && (
        <p className="mt-1 text-xs text-gray-500">
          Đã chọn: <code className="rounded bg-gray-100 px-1">{selected.slug}</code>
        </p>
      )}
    </div>
  )
}
