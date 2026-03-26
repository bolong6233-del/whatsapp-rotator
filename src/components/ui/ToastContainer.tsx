'use client'

import { useToast } from '@/context/ToastContext'

// Static keyframes string, defined once outside the component to avoid recreation
const TOAST_KEYFRAMES = `
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(1rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
`

/**
 * Fixed top-right toast notification stack.
 * Mount once inside dashboard/layout.tsx.
 */
export default function ToastContainer() {
  const { toasts, dismissToast } = useToast()

  return (
    <>
      <style>{TOAST_KEYFRAMES}</style>
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '1rem',
            right: '1rem',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxWidth: '22rem',
          }}
        >
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success'
            const isError   = toast.type === 'error'
            return (
              <div
                key={toast.id}
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  animation: 'slideInRight 0.25s ease',
                  backgroundColor: isSuccess ? '#f0fdf4' : isError ? '#fef2f2' : '#f0f9ff',
                  border: `1px solid ${isSuccess ? '#bbf7d0' : isError ? '#fecaca' : '#bae6fd'}`,
                  color: isSuccess ? '#15803d' : isError ? '#dc2626' : '#0369a1',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: '1rem', lineHeight: 1.4, flexShrink: 0 }}>
                  {isSuccess ? '✅' : isError ? '❌' : 'ℹ️'}
                </span>
                <span style={{ flex: 1, lineHeight: 1.5 }}>{toast.message}</span>
                <button
                  onClick={() => dismissToast(toast.id)}
                  aria-label="关闭通知"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    opacity: 0.6,
                    fontSize: '1rem',
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
