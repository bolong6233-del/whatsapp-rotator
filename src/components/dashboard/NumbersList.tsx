'use client'

import type { WhatsAppNumber } from '@/types'

interface NumbersListProps {
  numbers: WhatsAppNumber[]
  onDelete?: (id: string) => void
  onToggle?: (id: string, isActive: boolean) => void
}

export default function NumbersList({ numbers, onDelete, onToggle }: NumbersListProps) {
  if (numbers.length === 0) {
    return <p className="text-gray-400 text-sm">暂无号码</p>
  }

  return (
    <ul className="space-y-2">
      {numbers.map((num) => (
        <li key={num.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <span className="font-mono text-sm text-gray-800">{num.phone_number}</span>
            {num.label && <span className="text-gray-500 text-xs ml-2">({num.label})</span>}
            <span className="text-xs text-gray-400 ml-3">{num.click_count} 次</span>
          </div>
          <div className="flex gap-2">
            {onToggle && (
              <button
                onClick={() => onToggle(num.id, num.is_active)}
                className={`text-xs px-2 py-1 rounded ${num.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
              >
                {num.is_active ? '启用' : '停用'}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(num.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                删除
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
