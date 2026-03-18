'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { generateSlug } from '@/lib/utils'

export default function CreateLinkPage() {
  const router = useRouter()
  const [slug, setSlug] = useState(generateSlug())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [numbers, setNumbers] = useState<{ phone: string; label: string }[]>([
    { phone: '', label: '' },
  ])
  const [batchInput, setBatchInput] = useState('')
  const [showBatch, setShowBatch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addNumber = () => {
    setNumbers([...numbers, { phone: '', label: '' }])
  }

  const removeNumber = (index: number) => {
    setNumbers(numbers.filter((_, i) => i !== index))
  }

  const updateNumber = (index: number, field: 'phone' | 'label', value: string) => {
    const updated = [...numbers]
    updated[index][field] = value
    setNumbers(updated)
  }

  const handleBatchAdd = () => {
    const lines = batchInput.split('\n').map((l) => l.trim()).filter(Boolean)
    const newNumbers = lines.map((line) => ({ phone: line, label: '' }))
    setNumbers([...numbers.filter((n) => n.phone), ...newNumbers])
    setBatchInput('')
    setShowBatch(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validNumbers = numbers.filter((n) => n.phone.trim())
    if (validNumbers.length === 0) {
      setError('请至少添加一个 WhatsApp 号码')
      return
    }

    if (!slug.trim()) {
      setError('请输入短链后缀')
      return
    }

    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: link, error: linkError } = await supabase
        .from('short_links')
        .insert({
          slug: slug.trim(),
          title: title.trim() || null,
          description: description.trim() || null,
          user_id: user.id,
        })
        .select()
        .single()

      if (linkError) {
        if (linkError.message.includes('duplicate') || linkError.code === '23505') {
          setError('该短链后缀已被使用，请换一个')
        } else {
          setError('创建失败：' + linkError.message)
        }
        setLoading(false)
        return
      }

      const numberInserts = validNumbers.map((n, i) => ({
        short_link_id: link.id,
        phone_number: n.phone.trim(),
        label: n.label.trim() || null,
        sort_order: i,
      }))

      const { error: numbersError } = await supabase
        .from('whatsapp_numbers')
        .insert(numberInserts)

      if (numbersError) {
        setError('添加号码失败：' + numbersError.message)
        setLoading(false)
        return
      }

      router.push(`/dashboard/${link.id}`)
    } catch {
      setError('操作失败，请重试')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">创建短链</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">基本信息</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                短链后缀 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  placeholder="custom-slug"
                  pattern="[a-zA-Z0-9\-_]+"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSlug(generateSlug())}
                  className="px-4 py-2.5 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                >
                  随机生成
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">只能包含字母、数字、横线和下划线</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：双十一活动推广"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注说明</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="备注信息..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Phone Numbers */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-900">WhatsApp 号码</h2>
            <button
              type="button"
              onClick={() => setShowBatch(!showBatch)}
              className="text-sm text-green-600 hover:text-green-700"
            >
              批量添加
            </button>
          </div>

          {showBatch && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                批量输入号码（每行一个）
              </label>
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                rows={5}
                placeholder={'8613800138000\n8613900139000\n...'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={handleBatchAdd}
                className="mt-2 px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
              >
                确认添加
              </button>
            </div>
          )}

          <div className="space-y-3">
            {numbers.map((num, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    value={num.phone}
                    onChange={(e) => updateNumber(index, 'phone', e.target.value)}
                    placeholder="号码（如：8613800138000）"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div className="w-32">
                  <input
                    type="text"
                    value={num.label}
                    onChange={(e) => updateNumber(index, 'label', e.target.value)}
                    placeholder="备注（可选）"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeNumber(index)}
                  disabled={numbers.length === 1}
                  className="p-2.5 text-red-400 hover:text-red-600 disabled:opacity-30 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addNumber}
            className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-green-400 hover:text-green-600 transition-colors text-sm"
          >
            + 添加号码
          </button>
        </div>

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="flex-1 py-3 text-center text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            取消
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-lg font-medium transition-colors"
          >
            {loading ? '创建中...' : '创建短链'}
          </button>
        </div>
      </form>
    </div>
  )
}
