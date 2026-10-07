// Debug text in the top right corner (the top left holds the scene's time), shown with ?debug.
// The maintainer allows temporary text output for debugging before the UI is designed (ADR 0019).
// Plain text only, no controls. The box has a fixed width, so it does not jump as the numbers
// change; longer lines wrap.

export interface DebugText {
  update(lines: string[]): void
}

export function showDebugText(): DebugText {
  const element = document.createElement('pre')
  Object.assign(element.style, {
    position: 'fixed',
    top: '8px',
    right: '8px',
    width: '34ch',
    margin: '0',
    padding: '4px 6px',
    font: '12px/1.4 ui-monospace, monospace',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
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
