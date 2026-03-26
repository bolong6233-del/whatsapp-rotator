'use client'

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  showToast: () => {},
  dismissToast: () => {},
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  // Map from toast id → auto-dismiss timer
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: string) => {
    // Cancel the pending auto-dismiss so the timer doesn't fire after removal
    const timer = timersRef.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `toast-${++idRef.current}`
      setToasts((prev) => [...prev, { id, message, type }])
      // Auto-dismiss after 3.5 s
      const timer = setTimeout(() => {
        timersRef.current.delete(id)
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 3500)
      timersRef.current.set(id, timer)
    },
    []
  )

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
