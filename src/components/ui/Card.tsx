import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export default function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${padding ? 'p-6' : ''} ${className}`}>
      {children}
    </div>
  )
}
