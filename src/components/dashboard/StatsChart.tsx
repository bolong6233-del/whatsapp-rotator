'use client'

interface DataPoint {
  label: string
  value: number
}

interface StatsChartProps {
  data: DataPoint[]
  title?: string
}

export default function StatsChart({ data, title }: StatsChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1)

  return (
    <div>
      {title && <h3 className="text-sm font-medium text-gray-700 mb-3">{title}</h3>}
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-sm text-gray-600 w-28 truncate">{item.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div
                className="bg-green-400 h-2 rounded-full transition-all"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-sm text-gray-500 w-12 text-right">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
