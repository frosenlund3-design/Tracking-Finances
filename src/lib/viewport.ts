/**
 * Keeping the app the same size as the part of the screen you can actually see.
 *
 * This is the fix for "skærmen fryser, og jeg må lukke appen og åbne den igen".
 *
 * The app is one fixed-height, non-scrolling container, which is what makes it
 * feel like an app rather than a web page. On iOS that runs into the keyboard.
 * When the keyboard opens, the layout viewport does not shrink: `100dvh` still
 * reports the full screen. Only the *visual* viewport shrinks. So the container
 * stays taller than the visible area, the field she is typing in sits behind
 * the keyboard, and iOS responds by scrolling the visual viewport up on its
 * own.
 *
 * When the keyboard goes away again that scroll is not always undone. The page
 * now paints in one place and receives touches in another, so buttons stop
 * responding and nothing looks wrong. It is not frozen; it is offset. Killing
 * the app and reopening it resets the viewport, which is exactly why that
 * appeared to be the cure.
 *
 * So: measure the visual viewport, publish it as a CSS variable, and put the
 * layout viewport back where it belongs whenever the keyboard closes.
 */

let started = false

function apply(): void {
  const vv = window.visualViewport
  const height = vv?.height ?? window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`)

  // How much of the screen the keyboard is covering. Used by the chat input so
  // it can sit above the keyboard instead of behind it.
  const covered = Math.max(0, window.innerHeight - height - (vv?.offsetTop ?? 0))
  document.documentElement.style.setProperty('--keyboard', `${Math.round(covered)}px`)
  document.documentElement.dataset.keyboard = covered > 120 ? 'open' : 'closed'
}

/**
 * Undo the scroll iOS performed to get the focused field above the keyboard.
 *
 * Only ever when the keyboard is gone: doing it while she is typing would
 * fight the browser and hide the field she is looking at.
 */
function resetScrollWhenKeyboardClosed(): void {
  const vv = window.visualViewport
  const covered = Math.max(0, window.innerHeight - (vv?.height ?? window.innerHeight))
  if (covered > 120) return
  if (window.scrollY !== 0 || (vv?.offsetTop ?? 0) !== 0) window.scrollTo(0, 0)
}

export function trackViewport(): void {
  if (started || typeof window === 'undefined') return
  started = true

  apply()

  const vv = window.visualViewport
  if (vv) {
    vv.addEventListener('resize', () => {
      apply()
      resetScrollWhenKeyboardClosed()
    })
    vv.addEventListener('scroll', apply)
  }
  window.addEventListener('resize', apply)
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 250))

  // Coming back from another app is the other moment the viewport can be left
  // in a strange state.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    window.setTimeout(() => {
      apply()
      resetScrollWhenKeyboardClosed()
    }, 60)
  })

  // A field losing focus is the reliable signal that the keyboard is on its way
  // out. The delay lets iOS finish its own animation first.
  document.addEventListener(
    'focusout',
    () => window.setTimeout(resetScrollWhenKeyboardClosed, 350),
    true,
  )
}
