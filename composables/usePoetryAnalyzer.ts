export const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'enm', label: 'Middle English' },
  { value: 'fro', label: 'Old French' },
  { value: 'ang', label: 'Anglo-Norman' },
  { value: 'other', label: 'Other / uncertain' },
]

export type Part = { text: string; syllables?: number }
export type PoemLine = { id: number; stanza: number; parts: Part[] }

export function normalizeWord(word: string) {
  return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
}

export function countSyllables(word: string, language: string) {
  const normalized = normalizeWord(word)
  if (!normalized) return 1

  const vowels = normalized.match(/[aeiouy]+/g) || []
  let count = vowels.length || 1

  if (/(?:[aeiou]e|[aeiou]es)$/i.test(normalized) && !/le$/i.test(normalized) && !/ye$/i.test(normalized)) {
    count = Math.max(1, count - 1)
  }

  if (['en', 'enm'].includes(language) && /[^aeiou]le$/i.test(normalized)) {
    count += 1
  }

  return Math.max(1, count)
}

export function tokenizeText(input: string, language: string): Part[] {
  const matches = input.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) || []
  return matches.map((token) => /[\p{L}\p{M}]/u.test(token)
    ? { text: token, syllables: countSyllables(token, language) }
    : { text: token })
}

export function lineText(line: PoemLine) {
  return line.parts.map((part) => part.text).join('')
}

export function finalWord(line: PoemLine) {
  if (/(?:\.{3,}|…+)\s*$/.test(lineText(line))) return ''
  const final = [...line.parts].reverse().find((part) => part.syllables !== undefined)
  return final?.text || ''
}

export function rhymeTail(word: string) {
  const normalized = normalizeWord(word)
  if (!normalized) return ''

  const tail = normalized.match(/[aeiouy]+[^aeiouy]*$/)?.[0] || normalized
  return tail.replace(/([aeiou])\1+$/g, '$1')
}

export function analyzeText(input: string, language: string) {
  const lines: PoemLine[] = []
  let stanza = 0
  let seenBlank = false

  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) {
      if (!seenBlank && lines.length > 0) stanza += 1
      seenBlank = true
      continue
    }

    seenBlank = false
    lines.push({ id: Math.random(), stanza, parts: tokenizeText(raw.trim(), language) })
  }

  return lines
}

export function buildRhymeGroups(lines: PoemLine[]) {
  const groups = new Map<string, string[]>()
  for (const line of lines) {
    const ending = finalWord(line)
    if (!ending) continue
    const key = rhymeTail(ending)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ending)
  }

  return [...groups.entries()].filter(([, words]) => words.length > 1)
}
