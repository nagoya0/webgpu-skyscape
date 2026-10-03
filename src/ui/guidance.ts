// The screen shown instead of a black canvas when the demo cannot run (ADR 0003).

export function showGuidance(reason: string, details: readonly string[] = []): void {
  const section = document.getElementById('guidance')
  const reasonElement = document.getElementById('guidance-reason')
  const detailsElement = document.getElementById('guidance-details')
  if (section === null || reasonElement === null || detailsElement === null) {
    return
  }
  reasonElement.textContent = reason
  detailsElement.replaceChildren(
    ...details.map(text => {
      const item = document.createElement('li')
      item.textContent = text
      return item
    })
  )
  detailsElement.hidden = details.length === 0
  document.getElementById('app')?.replaceChildren()
  section.hidden = false
}
