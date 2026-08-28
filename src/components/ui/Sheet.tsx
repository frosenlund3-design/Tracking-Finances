import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

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
/**
 * How many sheets are open. Several can be stacked (a task opened from the
 * coach), and each one used to clear the body scroll lock on its way out,
 * including when it was not the last one left.
 */
let openSheets = 0

/** Sized from the visible viewport, see lib/viewport.ts. */
const SHEET_FULL = 'calc(var(--app-height, 100dvh) * 0.96)'
const SHEET_MAX = 'calc(var(--app-height, 100dvh) * 0.92)'

export function Sheet({ open, onClose, children, title, full, hideClose }: Props) {
  // Dragging is started from the grab handle only.
  //
  // The whole sheet used to be draggable, which fights the scrolling list
  // inside it: a swipe up in the content area is both a scroll and a drag, and
  // if the browser cancels the pointer partway through (a system gesture, a
  // notification, the keyboard appearing) the drag can be left running with
  // nothing to end it. Pointer events then go to a gesture that is not
  // happening, and the screen stops responding without looking broken.
  const dragControls = useDragControls()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    openSheets += 1
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      openSheets = Math.max(0, openSheets - 1)
      if (openSheets === 0) document.body.style.overflow = ''
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
            // Measured against the visible height, not the theoretical one, so
            // a full sheet with a text field in it shrinks when the keyboard
            // arrives instead of hiding the field behind it.
            style={full ? { height: SHEET_FULL } : { maxHeight: SHEET_MAX }}
            className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-t-xl3 bg-surface shadow-lift"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            ref={dialog}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 700) onClose()
            }}
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              // A generous target: the handle is 6px tall, and this is the
              // whole strip around it.
              className="shrink-0 touch-none pt-3 pb-1 flex min-h-[26px] items-center justify-center cursor-grab active:cursor-grabbing"
            >
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
