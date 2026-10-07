// Debug text in the top right corner (the top left holds the scene's time), shown with ?debug. The maintainer allows temporary text
// output for debugging before the UI is designed (ADR 0019). Plain text only, no controls.

export interface DebugText {
  update(lines: string[]): void
}

export function showDebugText(): DebugText {
  const element = document.createElement('pre')
  Object.assign(element.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    margin: '0',
    padding: '4px 6px',
    font: '12px/1.4 ui-monospace, monospace',
    color: '#fff',
    background: 'rgba(0, 0, 0, 0.5)',
    pointerEvents: 'none',
    zIndex: '10'
  })
  document.body.appendChild(element)
  let last = -Infinity
  return {
    update(lines) {
      // A few times a second is enough to read, and keeps the DOM work small.
      const now = performance.now()
      if (now - last < 250) return
      last = now
      element.textContent = lines.join('\n')
    }
  }
}
