import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { haptic } from '@/lib/haptics'

type Variant = 'primary' | 'soft' | 'ghost' | 'quiet'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  full?: boolean
  children: ReactNode
}

const STYLES: Record<Variant, string> = {
  primary: 'bg-ink text-canvas shadow-soft active:scale-[0.98]',
  soft: 'bg-accent-soft text-ink active:scale-[0.98]',
  ghost: 'bg-raised text-ink border border-line active:scale-[0.98]',
  quiet: 'text-muted active:scale-[0.98]',
}

/** Minimum 48px tall — comfortably above the 44px touch-target floor. */
export function Button({ variant = 'primary', full, className = '', children, onClick, ...rest }: Props) {
  return (
    <button
      {...rest}
      onClick={(e) => {
        haptic('tap')
        onClick?.(e)
      }}
      className={`focus-ring min-h-[52px] rounded-xl2 px-6 text-[16px] font-medium transition-transform duration-150 ${
        STYLES[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
