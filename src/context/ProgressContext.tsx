'use client'

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
} from 'react'

interface ProgressContextValue {
  /** Call before starting an async operation. */
  start: () => void
  /** Call after the async operation completes (success or error). */
  done: () => void
  /** True while any operation is in-flight. */
  active: boolean
  /** 0–100 progress value for the bar. */
  progress: number
}

const ProgressContext = createContext<ProgressContextValue>({
  start: () => {},
  done: () => {},
  active: false,
  progress: 0,
})

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false)
  const [progress, setProgress] = useState(0)

  // Track concurrent in-flight operations
  const countRef = useRef(0)
  // Timer used to fake linear progress while waiting
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Timer used to hide the bar after completion
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  const start = useCallback(() => {
    countRef.current += 1
    clearTimers()
    setActive(true)
    setProgress(5)

    // Simulate progress: increment by a shrinking amount up to ~80%
    let current = 5
    timerRef.current = setInterval(() => {
      const increment = (80 - current) * 0.12
      current = Math.min(current + increment, 80)
      setProgress(Math.round(current))
    }, 200)
  }, [])

  const done = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    if (countRef.current > 0) return // still other operations in-flight

    clearTimers()
    setProgress(100)

    hideTimerRef.current = setTimeout(() => {
      setActive(false)
      setProgress(0)
    }, 400)
  }, [])

  return (
    <ProgressContext.Provider value={{ start, done, active, progress }}>
      {children}
    </ProgressContext.Provider>
  )
}

export function useTopProgress() {
  return useContext(ProgressContext)
}
