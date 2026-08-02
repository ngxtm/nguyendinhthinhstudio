/**
 * Enhanced Tree View Component for Tags
 * Shows clear hierarchical structure with better visual cues
 */

'use client'

import { ChevronRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Edit2, Trash2 } from 'lucide-react'

interface TagTreeViewProps {
  mainCategories: any[]
  subCategories: any[]
  stylesTags: any[]
  locationsTags: any[]
  onEdit: (tag: any) => void
  onDelete: (tag: any) => void
}

export default function TagTreeView({
  mainCategories,
  subCategories,
  stylesTags,
  locationsTags,
  onEdit,
  onDelete,
}: TagTreeViewProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(mainCategories.map(c => c.id))
  )

  const toggleCategory = (id: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedCategories(newExpanded)
  }

  return (
    <div className="mb-8 rounded-lg bg-white shadow">
      <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">
          📂 Cấu trúc phân cấp thẻ
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Xem mối quan hệ cha-con giữa các thẻ
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* ========================================
            SECTION 1: HIERARCHICAL TAGS (Parent-Child)
            ======================================== */}
        {mainCategories.length > 0 && (
          <div className="border-l-4 border-blue-500 pl-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                <span className="text-lg">🌳</span>
              </div>
              <div>
                <h3 className="font-semibold text-blue-900">
                  Thẻ có phân cấp
                </h3>
                <p className="text-xs text-blue-600">
                  {mainCategories.length} thẻ chính, {subCategories.length} thẻ con
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {mainCategories.map((main) => {
                const children = subCategories.filter(
                  (sub) => (sub as any).parentSlug === main.slug
                )
                const isExpanded = expandedCategories.has(main.id)
                const hasChildren = children.length > 0

                return (
                  <div
                    key={main.id}
                    className="rounded-lg border-2 border-blue-100 bg-gradient-to-r from-blue-50 to-white"
                  >
                    {/* Parent Tag */}
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3 flex-1">
                        {/* Expand/Collapse Button */}
                        {hasChildren ? (
                          <button
                            onClick={() => toggleCategory(main.id)}
                            className="flex h-6 w-6 items-center justify-center rounded hover:bg-blue-100"
                          >
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-blue-600" />
                            ) : (
                              <ChevronRight size={16} className="text-blue-600" />
                            )}
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}

                        {/* Parent Icon & Badge */}
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-white">
                            📁
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{main.name}</span>
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                CHA
                              </span>
                              {hasChildren && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  {children.length} thẻ con
                                </span>
                              )}
                            </div>
                            <code className="text-xs text-gray-500">{main.slug}</code>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => onEdit(main)}
                          className="rounded p-2 text-gray-600 hover:bg-white hover:shadow"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => onDelete(main)}
                          className="rounded p-2 text-red-600 hover:bg-red-50 hover:shadow"
                          title="Xóa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Children Tags */}
                    {hasChildren && isExpanded && (
                      <div className="border-t border-blue-100 bg-white p-3">
                        <div className="space-y-2">
                          {children.map((child, idx) => (
                            <div
                              key={child.id}
                              className="group ml-9 flex items-center justify-between rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-white p-3 transition-all hover:shadow-md"
                            >
                              <div className="flex items-center gap-3">
                                {/* Tree Line */}
                                <div className="flex items-center gap-1">
                                  <div className="h-px w-4 bg-green-400" />
                                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-green-500 text-white text-xs font-bold">
                                    {idx + 1}
                                  </div>
                                </div>

                                {/* Child Info */}
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">{child.name}</span>
                                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                      CON
                                    </span>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                                    <code className="text-gray-500">{child.slug}</code>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-green-600">Cha: {main.name}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => onEdit(child)}
                                  className="rounded p-1.5 text-gray-600 hover:bg-white hover:shadow"
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => onDelete(child)}
                                  className="rounded p-1.5 text-red-600 hover:bg-red-50 hover:shadow"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Empty State */}
            {mainCategories.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-blue-200 bg-blue-50 p-8 text-center">
                <div className="text-4xl mb-2">🌱</div>
                <p className="text-sm text-gray-600">
                  Chưa có thẻ chính nào. Tạo thẻ chính để bắt đầu phân cấp.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================
            SECTION 2: FLAT TAGS (No hierarchy)
            ======================================== */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Styles */}
          <div className="border-l-4 border-purple-500 pl-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100">
                <span className="text-lg">🎨</span>
              </div>
              <div>
                <h3 className="font-semibold text-purple-900">Phong cách</h3>
                <p className="text-xs text-purple-600">
                  {stylesTags.length} thẻ, không có phân cấp
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stylesTags.length > 0 ? (
                stylesTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm transition-all hover:shadow-md"
                  >
                    <span className="font-medium text-gray-900">{tag.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(tag)}
                        className="rounded-full p-1 text-gray-600 hover:bg-purple-100"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={() => onDelete(tag)}
                        className="rounded-full p-1 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border-2 border-dashed border-purple-200 bg-purple-50 p-4 text-center text-sm text-gray-600 w-full">
                  Chưa có thẻ phong cách
                </div>
              )}
            </div>
          </div>

          {/* Locations */}
          <div className="border-l-4 border-orange-500 pl-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100">
                <span className="text-lg">📍</span>
              </div>
              <div>
                <h3 className="font-semibold text-orange-900">Địa điểm</h3>
                <p className="text-xs text-orange-600">
                  {locationsTags.length} thẻ, không có phân cấp
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {locationsTags.length > 0 ? (
                locationsTags.map((tag) => (
                  <div
                    key={tag.id}
                    className="group flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm transition-all hover:shadow-md"
                  >
                    <span className="font-medium text-gray-900">{tag.name}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(tag)}
                        className="rounded-full p-1 text-gray-600 hover:bg-orange-100"
                      >
                        <Edit2 size={10} />
                      </button>
                      <button
                        onClick={() => onDelete(tag)}
                        className="rounded-full p-1 text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border-2 border-dashed border-orange-200 bg-orange-50 p-4 text-center text-sm text-gray-600 w-full">
                  Chưa có thẻ địa điểm
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-700">Chú thích:</h4>
          <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                CHA
              </span>
              <span>Thẻ chính, có thể có thẻ con</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                CON
              </span>
              <span>Thẻ con, thuộc về 1 thẻ cha</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-purple-600">🎨 Phong cách:</span>
              <span>Thẻ độc lập, không có phân cấp</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-orange-600">📍 Địa điểm:</span>
              <span>Thẻ độc lập, không có phân cấp</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
