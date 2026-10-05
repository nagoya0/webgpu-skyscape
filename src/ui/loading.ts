// Temporary loading screen, allowed as an exception to ADR 0019 like the guidance screen. It is
// to be redesigned with the rest of the UI.

export interface LoadingScreen {
  /** Shows progress text, such as how many tiles are still loading. */
  setText(text: string): void
  /** Fades the screen out and removes it. */
  hide(): void
}

export function showLoading(): LoadingScreen {
  const element = document.createElement('div')
  element.className = 'loading'
  element.textContent = 'Loading…'
  document.body.appendChild(element)
  let hidden = false
  return {
    setText(text) {
      if (!hidden) element.textContent = text
    },
    hide() {
      if (hidden) return
      hidden = true
      element.classList.add('done')
      element.addEventListener('transitionend', () => element.remove(), { once: true })
      // Remove anyway if no transition runs, for example with reduced motion.
      setTimeout(() => element.remove(), 2000)
    }
  }
}
