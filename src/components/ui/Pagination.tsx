'use client'

import { useState } from 'react'

interface PaginationProps {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageSizeOptions?: number[]
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 200]

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | '...')[] = []
  if (current <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', total)
  } else if (current >= total - 3) {
    pages.push(1, '...', total - 4, total - 3, total - 2, total - 1, total)
  } else {
    pages.push(1, '...', current - 1, current, current + 1, '...', total)
  }
  return pages
}

export default function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const [jumpValue, setJumpValue] = useState('')

  const handleJump = () => {
    const n = parseInt(jumpValue, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n)
    }
    setJumpValue('')
  }

  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 text-xs text-gray-600">
      {/* Left: total count */}
      <span className="text-sm text-gray-500 whitespace-nowrap">共 {totalCount} 条</span>

      {/* Center: page buttons */}
      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50 transition-colors"
          aria-label="上一页"
        >
          ‹
        </button>

        {pageNumbers.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className="px-2 py-1 text-gray-400 select-none">
              ···
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`min-w-[30px] px-2 py-1 border rounded transition-colors ${
                p === page
                  ? 'bg-blue-500 text-white border-blue-500 font-semibold'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50 transition-colors"
          aria-label="下一页"
        >
          ›
        </button>
      </div>

      {/* Right: page size selector + jump */}
      <div className="flex items-center gap-3">
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value))
          }}
          className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {pageSizeOptions.map((s) => (
            <option key={s} value={s}>
              {s} 条/页
            </option>
          ))}
        </select>

        <span className="whitespace-nowrap flex items-center gap-1">
          前往
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            className="w-12 border border-gray-300 rounded px-1.5 py-1 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          页
          <button
            onClick={handleJump}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            确定
          </button>
        </span>
      </div>
    </div>
  )
}
