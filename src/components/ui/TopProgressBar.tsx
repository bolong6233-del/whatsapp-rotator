'use client'

import { useTopProgress } from '@/context/ProgressContext'

/**
 * A slim NProgress-style bar fixed at the very top of the viewport.
 * Driven by ProgressContext – mount once in dashboard/layout.tsx.
 */
export default function TopProgressBar() {
  const { active, progress } = useTopProgress()

  if (!active && progress === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          backgroundColor: '#22c55e',
          transition: progress === 100
            ? 'width 0.15s ease-out, opacity 0.4s ease 0.15s'
            : 'width 0.2s ease',
          opacity: active ? 1 : 0,
          boxShadow: '0 0 8px rgba(34,197,94,0.6)',
        }}
      />
    </div>
  )
}
