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
export type PoemLine = { id: number; stanza: number; parts: Part[]; gap?: boolean; stanzaBreak?: boolean }
export type SavedText = { id: string; title: string; text: string; language: string; sourceUrl?: string; period?: string; year?: string; updatedAt?: number }
export type RhymeFeedback = { a: string; b: string; rhymes: boolean }
export type PairRecord = { a: string; b: string; frequency: number; sections: number[]; confidence: number; status: string }
export type VowelRecord = { a: string; b: string; count: number; examples: string[] }

export function normalizeWord(word: string) {
  return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
}

export function pairKey(a: string, b: string) {
  return [normalizeWord(a), normalizeWord(b)].sort().join('|')
}

export function countSyllables(word: string, language: string) {
  const normalized = normalizeWord(word)
  if (!normalized) return 1

  const vowelMatch = normalized.match(/[aeiouy]+/g) || []
  let count = Math.max(1, vowelMatch.length || 1)

  if (/(?:[aeiou]e|[aeiou]es)$/i.test(normalized) && !/le$/i.test(normalized) && !/ye$/i.test(normalized) && count > 1) {
    count -= 1
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
  const lastWord = [...line.parts].reverse().find((part) => part.syllables !== undefined)
  return lastWord?.text || ''
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
  let previousBlank = false

  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) {
      if (!previousBlank && lines.length > 0) stanza += 1
      previousBlank = true
      continue
    }

    previousBlank = false
    lines.push({
      id: Math.round(Date.now() + Math.random() * 10000),
      stanza,
      parts: tokenizeText(raw.trim(), language),
      gap: false,
      stanzaBreak: false,
    })
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

export function buildPairDictionary(lines: PoemLine[], feedback: RhymeFeedback[]): PairRecord[] {
  const observed = new Map<string, { a: string; b: string; frequency: number; sections: Set<number>; confidence: number; status: string }>()

  for (const stanza of new Set(lines.map((line) => line.stanza))) {
    const stanzaLines = lines.filter((line) => line.stanza === stanza && !line.gap && !!finalWord(line))
    for (let i = 0; i < stanzaLines.length; i++) {
      for (let j = i + 1; j < stanzaLines.length; j++) {
        const a = finalWord(stanzaLines[i])
        const b = finalWord(stanzaLines[j])
        if (!a || !b) continue

        const saved = feedback.find((entry) => pairKey(entry.a, entry.b) === pairKey(a, b))
        const sameTarget = rhymeTail(a) === rhymeTail(b)
        if (saved?.rhymes === false && !sameTarget) continue
        if (saved?.rhymes !== true && saved?.rhymes !== false && !sameTarget) continue

        const key = pairKey(a, b)
        const current = observed.get(key)
        const confidence = sameTarget ? 82 : 100
        if (current) {
          current.frequency += 1
          current.sections.add(stanza)
          current.confidence = Math.max(current.confidence, confidence)
          if (saved) current.status = saved.rhymes ? 'Manually marked rhyme' : 'Manually marked not rhyme'
        } else {
          observed.set(key, {
            a,
            b,
            frequency: 1,
            sections: new Set([stanza]),
            confidence,
            status: saved ? (saved.rhymes ? 'Manually marked rhyme' : 'Manually marked not rhyme') : 'Spelling-tail / inferred group',
          })
        }
      }
    }
  }

  return [...observed.values()]
    .map((entry) => ({
      a: entry.a,
      b: entry.b,
      frequency: entry.frequency,
      sections: [...entry.sections].sort((a, b) => a - b),
      confidence: entry.confidence,
      status: entry.status,
    }))
    .sort((a, b) => b.frequency - a.frequency || a.a.localeCompare(b.a) || a.b.localeCompare(b.b))
}

export function buildVowelCorrespondences(lines: PoemLine[], feedback: RhymeFeedback[]): VowelRecord[] {
  const counts = new Map<string, { a: string; b: string; count: number; examples: Set<string> }>()

  for (const stanza of new Set(lines.map((line) => line.stanza))) {
    const stanzaLines = lines.filter((line) => line.stanza === stanza && !line.gap && !!finalWord(line))
    for (let i = 0; i < stanzaLines.length; i++) {
      for (let j = i + 1; j < stanzaLines.length; j++) {
        const a = finalWord(stanzaLines[i])
        const b = finalWord(stanzaLines[j])
        if (!a || !b) continue

        const isManualMatch = feedback.some((entry) => pairKey(entry.a, entry.b) === pairKey(a, b) && entry.rhymes)
        const sameTail = rhymeTail(a) === rhymeTail(b)
        if (!isManualMatch && !sameTail) continue

        const nucleusA = (a.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[aeiouy]+/g)?.at(-1) || '').toUpperCase()
        const nucleusB = (b.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[aeiouy]+/g)?.at(-1) || '').toUpperCase()
        if (!nucleusA || !nucleusB || nucleusA === nucleusB) continue

        const [left, right] = [nucleusA, nucleusB].sort()
        const key = `${left}|${right}`
        if (!counts.has(key)) counts.set(key, { a: left, b: right, count: 0, examples: new Set() })
        const entry = counts.get(key)!
        entry.count += 1
        entry.examples.add(`${a} / ${b}`)
      }
    }
  }

  return [...counts.values()]
    .map((entry) => ({ a: entry.a, b: entry.b, count: entry.count, examples: [...entry.examples].slice(0, 5) }))
    .sort((a, b) => b.count - a.count)
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character] as string))
}

export function saveJudgment(feedback: RhymeFeedback[], a: string, b: string, rhymes: boolean) {
  const next = feedback.filter((entry) => pairKey(entry.a, entry.b) !== pairKey(a, b))
  next.push({ a, b, rhymes })
  return next
}

export function buildCandidates(lines: PoemLine[], feedback: RhymeFeedback[]) {
  const output: Array<Array<{ index: number; word: string; probability: number; reasons: string[]; judgment?: boolean }>> = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const word = finalWord(line)
    if (!word) {
      output.push([])
      continue
    }

    const related: Array<{ index: number; word: string; probability: number; reasons: string[]; judgment?: boolean }> = []
    for (let otherIndex = 0; otherIndex < lines.length; otherIndex++) {
      if (otherIndex === lineIndex) continue
      const target = finalWord(lines[otherIndex])
      if (!target) continue
      const sameTail = rhymeTail(word) === rhymeTail(target)
      const saved = feedback.find((entry) => pairKey(entry.a, entry.b) === pairKey(word, target))
      const probability = sameTail ? 82 : 18
      const reasons = sameTail
        ? [`Matching rhyme tail: ${rhymeTail(word)}`]
        : ['No exact spelling-tail match; historical sound may still rhyme.']
      related.push({
        index: otherIndex,
        word: target,
        probability,
        reasons,
        judgment: saved?.rhymes,
      })
    }

    related.sort((a, b) => b.probability - a.probability)
    output.push(related)
  }

  return output
}

export function lineTotal(line: PoemLine) {
  return line.parts.reduce((sum, part) => sum + (part.syllables ?? 0), 0)
}
