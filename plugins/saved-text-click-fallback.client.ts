export default defineNuxtPlugin(() => {
  if (typeof document === 'undefined') return

  // The saved-text rows already have Vue click handlers. If a browser/build
  // fails to invoke that handler, provide a DOM-level fallback to load the
  // selected text and run analysis instead of leaving the click inert.
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest('li button')
    if (!button || button.textContent?.trim() === 'Delete') return
    const section = button.closest('section')
    if (!section?.querySelector('h2')?.textContent?.includes('Saved texts')) return

    const title = button.textContent?.trim().split(' · ')[0]
    if (!title) return
    let saved: Array<{ title?: string; text?: string; language?: string; sourceUrl?: string; period?: string; year?: string }> = []
    try {
      saved = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    } catch {
      return
    }
    const item = saved.find((entry) => entry.title === title && typeof entry.text === 'string')
    if (!item) return

    window.setTimeout(() => {
      // A successful Vue handler switches to the analyzed-poem view. Only
      // perform the fallback if the input form is still visible.
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="One verse line per row"]')
      if (!textarea) return

      const setValue = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null, value: string) => {
        if (!element) return
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
        setter?.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }

      setValue(document.querySelector<HTMLInputElement>('input[placeholder="Poem title"]'), item.title || 'Untitled poem')
      setValue(textarea, item.text || '')
      const languageLabel = [...document.querySelectorAll('label')].find((label) => label.textContent?.trim().startsWith('Language'))
      setValue(languageLabel?.querySelector('select') || null, item.language || 'enm')
      setValue(document.querySelector<HTMLInputElement>('input[placeholder^="https://"]'), item.sourceUrl || '')
      setValue(document.querySelector<HTMLInputElement>('input[placeholder="e.g. 14th century"]'), item.period || '')
      setValue(document.querySelector<HTMLInputElement>('input[placeholder="e.g. c. 1380"]'), item.year || '')
      document.querySelectorAll<HTMLButtonElement>('button').forEach((candidate) => {
        if (candidate.textContent?.trim().startsWith('Analyze poem')) candidate.click()
      })
    }, 40)
  }, true)
})
