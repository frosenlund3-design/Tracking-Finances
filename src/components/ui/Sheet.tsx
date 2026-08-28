import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  /** Full-height sheets are used for focus modes that take over the screen. */
  full?: boolean
  hideClose?: boolean
}

/**
 * Bottom sheet. Everything modal in Loops uses this so there is exactly one
 * mental model for "something opened, swipe or tap to close".
 */
export function Sheet({ open, onClose, children, title, full, hideClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative w-full max-w-[560px] bg-surface shadow-lift rounded-t-xl3 ${
              full ? 'h-[96dvh]' : 'max-h-[92dvh]'
            } flex flex-col overflow-hidden`}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose()
            }}
          >
            <div className="shrink-0 pt-3 pb-1 flex items-center justify-center cursor-grab active:cursor-grabbing">
              <div className="h-1.5 w-11 rounded-full bg-line" />
            </div>
            {(title || !hideClose) && (
              <div className="shrink-0 flex items-center justify-between px-6 pb-2">
                <h2 className="text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
                {!hideClose && (
                  <button
                    onClick={onClose}
                    aria-label="Luk"
                    className="focus-ring -mr-2 grid h-11 w-11 place-items-center rounded-full text-muted active:scale-95 transition"
                  >
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-6 pb-safe">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
