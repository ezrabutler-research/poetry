<script setup lang="ts">
type TextPart = { text: string; syllables?: number }
type Line = { id: number; parts: TextPart[]; gap: boolean; stanzaBreak: boolean }
type SavedText = { id: string; title: string; text: string; language: string; updatedAt: number }
type RhymeFeedback = { a: string; b: string; rhymes: boolean }
type Candidate = { index: number; word: string; probability: number; reasons: string[]; accepted: boolean }
const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' }, { value: 'ang', label: 'Anglo-Norman' }
]
const colors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const starterPairs = [['pounde','grounde'],['begynne','thinne'],['be','yemanry'],['stryfe','lyfe'],['me','be'],['disgrate','state'],['ende','amende'],['rychesse','kyndnesse'],['ayre','fayre'],['bolde','solde'],['the','see'],['tresouré','be'],['the','poverté'],['none','Johnn'],['rowe','sawe'],['Calveré','be'],['day','Abbey'],['contré','me'],['ryvere','bryre']]
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const feedbackFile = ref<HTMLInputElement | null>(null)
const activeLineId = ref<number | null>(null)
const editingWord = ref<{ lineId: number; partIndex: number } | null>(null)
const feedback = ref<RhymeFeedback[]>([])
const savedTexts = ref<SavedText[]>([])
const selectedSavedId = ref('')
const statusMessage = ref('')
const storageReady = ref(false)
const hasPoem = computed(() => lines.value.length > 0)

function normalize(word: string) { return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '') }
function tokenize(line: string): TextPart[] {
  const tokens = line.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) ?? []
  return tokens.map((text) => /[\p{L}\p{M}]/u.test(text) ? { text, syllables: countWordSyllables(text, language.value) } : { text })
}
function words(line: Line) { return line.parts.map((part, partIndex) => ({ part, partIndex })).filter(({ part }) => part.syllables !== undefined) }
function lineSyllables(line: Line) { return words(line).reduce((sum, { part }) => sum + (part.syllables ?? 0), 0) }
function finalWord(line: Line) { return [...words(line)].at(-1)?.part.text ?? '' }
function pairKey(a: string, b: string) { return [normalize(a), normalize(b)].sort().join('|') }
function rhymeTail(word: string) {
  let value = normalize(word)
  if (!value) return ''
  // Final y can represent the same long e sound; a final e is retained when removing it leaves no vowel.
  value = value.replace(/y$/, 'e')
  const accentedFinal = /[éèê]$/i.test(word)
  if (!accentedFinal && value.length > 2 && value.endsWith('e') && !/[aeiouy]e$/.test(value)) {
    const stem = value.slice(0, -1)
    if (/[aeiou]/.test(stem)) value = stem
  }
  const match = value.match(/[aeiou]+[^aeiou]*$/i)
  return (match?.[0] ?? value).replace(/([aeiou])\1+$/g, '$1')
}
function savedJudgment(a: string, b: string) { return feedback.value.find((item) => pairKey(item.a, item.b) === pairKey(a, b)) }
function acceptedFamilyMatch(a: string, b: string) {
  const tailA = rhymeTail(a); const tailB = rhymeTail(b)
  if (!tailA || !tailB || tailA !== tailB) return false
  return feedback.value.some((item) => item.rhymes && rhymeTail(item.a) === tailA && rhymeTail(item.b) === tailB)
}
function reasoning(a: string, b: string) {
  const left = normalize(a); const right = normalize(b); const reasons: string[] = []
  if (/[éèê]$/i.test(a) || /[éèê]$/i.test(b)) reasons.push('The accented final vowel (such as é) is counted as its own syllable and treated as pronounced.')
  if (left.endsWith('e') !== right.endsWith('e')) reasons.push('Assumes a written final -e may be silent in one word.')
  if ((left.endsWith('y') && right.endsWith('e')) || (right.endsWith('y') && left.endsWith('e'))) reasons.push('Assumes final -y can sound like -e in historical pronunciation.')
  if (!reasons.length) reasons.push(`The endings share the spelling-based rhyme tail “${rhymeTail(a)}”; historical pronunciation is still an estimate.`)
  return reasons
}

function countWordSyllables(word: string, lang: string) {
  const accentedFinal = /[éèê]$/i.test(word)
  const normalized = word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let count = 0; let inVowel = false
  for (const char of normalized) {
    const vowel = /[aeiouy]/i.test(char)
    if (vowel && !inVowel) count++
    inVowel = vowel
  }
  if (['fr', 'fro', 'ang'].includes(lang)) {
    if (count > 1 && /e$/.test(normalized) && !accentedFinal) count--
  } else if (['en', 'enm'].includes(lang)) {
    // Never discard an accented final e: tresouré / poverté have a pronounced final syllable.
    if (count > 1 && /e$/.test(normalized) && !accentedFinal && !/(le|ye)$/.test(normalized)) count--
    if (/[^aeiou]le$/.test(normalized)) count++
  }
  return Math.max(1, count)
}
function analyze() {
  let stanzaBreak = false; const result: Line[] = []
  for (const raw of poemInput.value.split(/\r?\n/)) {
    if (!raw.trim()) { if (result.length) stanzaBreak = true; continue }
    result.push({ id: nextId.value++, parts: tokenize(raw.trim()), gap: false, stanzaBreak })
    stanzaBreak = false
  }
  lines.value = result; activeLineId.value = null; editingWord.value = null
}
function setWordSyllables(line: Line, part: TextPart, value: string) {
  part.syllables = Math.max(0, Math.min(20, Number(value) || 0))
}
function setLineText(line: Line) { return line.parts.map((part) => part.text).join('') }
function addMissingLine(index = lines.value.length - 1) { lines.value.splice(index + 1, 0, { id: nextId.value++, parts: [], gap: true, stanzaBreak: false }) }
function loadText(item: SavedText) {
  poemTitle.value = item.title; poemInput.value = item.text; language.value = item.language
  selectedSavedId.value = item.id; analyze(); statusMessage.value = `Loaded “${item.title || 'Untitled poem'}”.`
}
function saveText() {
  const text = hasPoem.value ? lines.value.map(setLineText).join('\n') : poemInput.value
  if (!text.trim()) { statusMessage.value = 'Add poem text before saving.'; return }
  const existing = savedTexts.value.find((item) => item.id === selectedSavedId.value)
  const item: SavedText = { id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: poemTitle.value.trim() || 'Untitled poem', text, language: language.value, updatedAt: Date.now() }
  savedTexts.value = [item, ...savedTexts.value.filter((saved) => saved.id !== item.id)]
  selectedSavedId.value = item.id
  statusMessage.value = 'Text saved in this browser.'
}
function deleteSavedText(id: string) {
  savedTexts.value = savedTexts.value.filter((item) => item.id !== id)
  if (selectedSavedId.value === id) selectedSavedId.value = ''
}
onMounted(() => {
  try {
    const storedFeedback = localStorage.getItem('verse-rhyme-feedback')
    feedback.value = storedFeedback ? JSON.parse(storedFeedback) as RhymeFeedback[] : starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
    savedTexts.value = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]') as SavedText[]
  } catch {
    feedback.value = starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
    savedTexts.value = []
  }
  storageReady.value = true
})
watch(feedback, (value) => { if (storageReady.value) { try { localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value)) } catch { /* Continue without persistent storage. */ } } }, { deep: true })
watch(savedTexts, (value) => { if (storageReady.value) { try { localStorage.setItem('verse-saved-texts', JSON.stringify(value)) } catch { statusMessage.value = 'Browser storage is unavailable; this text could not be saved.' } } }, { deep: true })

const sectionIds = computed(() => {
  const explicit = lines.value.some((line, index) => index > 0 && line.stanzaBreak)
  return lines.value.map((_, index) => explicit
    ? lines.value.slice(0, index + 1).filter((line, at) => at > 0 && line.stanzaBreak).length
    : Math.floor(index / 4))
})
function sectionLineIndices(section: number) { return lines.value.map((_, i) => i).filter((i) => sectionIds.value[i] === section && !lines.value[i].gap) }
function pairProbability(a: string, b: string, indexA: number, indexB: number) {
  const judgment = savedJudgment(a, b)
  const tailA = rhymeTail(a); const tailB = rhymeTail(b)
  let probability = tailA && tailA === tailB ? 82 : 18
  let reasons = reasoning(a, b)
  if (acceptedFamilyMatch(a, b)) { probability = Math.max(probability, 90); reasons = [...reasons, 'This follows a rhyme-tail pattern you accepted before.'] }
  const indices = sectionLineIndices(sectionIds.value[indexA]); const posA = indices.indexOf(indexA); const posB = indices.indexOf(indexB)
  const scheme = likelyScheme.value
  if (scheme && posA >= 0 && posB >= 0 && posA !== posB && scheme.pattern[posA] === scheme.pattern[posB]) {
    probability = Math.max(probability, Math.min(78, 55 + Math.round(scheme.confidence * .23)))
    reasons = [...reasons, `These positions fit the repeated ${scheme.pattern} stanza pattern.`]
  }
  if (judgment?.rhymes) { probability = 100; reasons = [...reasons, 'You accepted this pair; that judgment is saved locally.'] }
  else if (judgment?.rhymes === false) { probability = 0; reasons = [...reasons, 'You marked this pair not a rhyme.'] }
  return { probability, reasons, accepted: judgment?.rhymes === true }
}
const candidatePairs = computed(() => lines.value.map((line, index) => {
  const word = finalWord(line)
  if (line.gap || !word) return []
  return sectionLineIndices(sectionIds.value[index]).filter((other) => other !== index).map((other) => {
    const otherWord = finalWord(lines.value[other]); const estimate = pairProbability(word, otherWord, index, other)
    return { index: other, word: otherWord, ...estimate }
  }).filter((candidate) => candidate.probability > 50).sort((a, b) => b.probability - a.probability)
}))
const rhymeGroups = computed(() => {
  const parent = lines.value.map((_, i) => i)
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const join = (a: number, b: number) => { parent[find(a)] = find(b) }
  for (let a = 0; a < lines.value.length; a++) for (let b = a + 1; b < lines.value.length; b++) {
    if (lines.value[a].gap || lines.value[b].gap || sectionIds.value[a] !== sectionIds.value[b]) continue
    if (pairProbability(finalWord(lines.value[a]), finalWord(lines.value[b]), a, b).probability > 50) join(a, b)
  }
  const ids = new Map<number, number>()
  return lines.value.map((line, i) => {
    if (line.gap || !finalWord(line)) return null
    const root = find(i); if (!ids.has(root)) ids.set(root, ids.size); return ids.get(root)!
  })
})
const sectionPatterns = computed(() => [...new Set(sectionIds.value)].map((id) => {
  const indices = sectionLineIndices(id); const labels = new Map<number, string>()
  const pattern = indices.map((i) => { const group = rhymeGroups.value[i]; if (group === null) return '?'; if (!labels.has(group)) labels.set(group, String.fromCharCode(65 + labels.size % 26)); return labels.get(group)! }).join('')
  return { indices, pattern }
}))
const likelyScheme = computed(() => {
  const patterns = sectionPatterns.value.filter((item) => item.pattern.length >= 2 && !item.pattern.includes('?'))
  if (!patterns.length) return null
  const counts = new Map<string, number>(); patterns.forEach((item) => counts.set(item.pattern, (counts.get(item.pattern) ?? 0) + 1))
  const [pattern, count] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { pattern, confidence: Math.round(count / patterns.length * 100), sections: patterns.length }
})
const rhymeCounts = computed(() => { const counts = new Map<number, number>(); rhymeGroups.value.forEach((group) => { if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1) }); return counts })
function rhymeColor(index: number) { const group = rhymeGroups.value[index]; return group !== null && group !== undefined && (rhymeCounts.value.get(group) ?? 0) > 1 ? colors[group % colors.length] : 'transparent' }
function setJudgment(indexA: number, indexB: number, rhymes: boolean) {
  const a = finalWord(lines.value[indexA]); const b = finalWord(lines.value[indexB]); if (!a || !b) return
  const key = pairKey(a, b); feedback.value = [...feedback.value.filter((item) => pairKey(item.a, item.b) !== key), { a, b, rhymes }]
}
function forgetJudgment(item: RhymeFeedback) { feedback.value = feedback.value.filter((entry) => pairKey(entry.a, entry.b) !== pairKey(item.a, item.b)) }
function exportFeedback() { download(new Blob([JSON.stringify(feedback.value, null, 2)], { type: 'application/json' }), 'verse-rhyme-feedback.json') }
function importFeedback(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)) as RhymeFeedback[]; if (!Array.isArray(parsed) || parsed.some((item) => typeof item.a !== 'string' || typeof item.b !== 'string' || typeof item.rhymes !== 'boolean')) throw new Error(); feedback.value = [...feedback.value.filter((old) => !parsed.some((item) => pairKey(old.a, old.b) === pairKey(item.a, item.b))), ...parsed] } catch { window.alert('Please choose a valid rhyme-feedback JSON file.') } }; reader.readAsText(file); input.value = ''
}
function onFileChange(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }; reader.readAsText(file); input.value = '' }
function endingParts(line: Line) { return words(line).at(-1)?.part }
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
function exportHtml() {
  const body = lines.value.map((line, index) => line.gap ? '<p class="line missing">[Missing line]</p>' : `<p class="line">${line.parts.map((part) => escapeHtml(part.text)).join('')} <span class="count">(${lineSyllables(line)})</span></p>`).join('\n')
  const title = escapeHtml(poemTitle.value || 'Untitled poem')
  download(new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px}.line{margin:0}.count{font:14px system-ui;color:#777}.missing{color:#986b32;font-style:italic}</style><h1>${title}</h1>${body}</html>`], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`)
}
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><a href="#top" class="flex items-center gap-3 no-underline"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></a><span class="text-sm text-stone-500">Poetry analysis</span></div></header>
    <main id="top" class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!hasPoem" class="mx-auto max-w-3xl"><p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1><p class="mt-3 text-stone-600">Read the poem, inspect likely rhymes, and adjust syllable counts word by word.</p>
        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"><div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div><input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title"><label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label><textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas."></textarea><div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><div class="flex gap-2"><button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700" @click="saveText">Save text</button><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button></div></div><p v-if="statusMessage" class="mt-3 text-sm text-[#315d45]" role="status">{{ statusMessage }}</p></div>
        <section v-if="savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5"><h2 class="font-semibold">Saved texts <span class="font-normal text-sm text-stone-500">(stored in this browser)</span></h2><ul class="mt-3 space-y-2"><li v-for="item in savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2"><button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="loadText(item)">{{ item.title }} <span class="font-normal text-stone-500">· {{ new Date(item.updatedAt).toLocaleDateString() }}</span></button><button class="text-xs text-stone-500 hover:text-red-700" @click="deleteSavedText(item.id)">Delete</button></li></ul></section>
        <p class="mt-4 text-xs leading-5 text-stone-500">Click Save text to keep a draft in this browser. In the poem, click a word’s small syllable count to adjust it. A final accented é is treated as a pronounced syllable.</p>
      </section>
      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []; poemInput = ''">← New poem</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div><div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="saveText">Save text</button><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button></div></div>
        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm"><div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Click an ending word for rhyme suggestions. Click any small word count to adjust syllables; line totals update automatically.</p><p v-if="likelyScheme" class="mt-2 text-sm text-[#315d45]">Likely rhyme scheme <strong>{{ likelyScheme.pattern }}</strong><span class="text-stone-500"> · {{ likelyScheme.confidence }}% of {{ likelyScheme.sections }} stanza/section patterns</span></p><p v-if="statusMessage" class="mt-2 text-sm text-[#315d45]" role="status">{{ statusMessage }}</p></div>
          <div class="px-5 py-5 sm:px-8 sm:py-7"><div v-for="(line, index) in lines" :key="line.id" class="poem-row" :class="line.stanzaBreak ? 'stanza-break' : ''"><p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line — position preserved</p><p v-else class="poem-line"><template v-for="(part, partIndex) in line.parts" :key="partIndex"><button v-if="part.syllables !== undefined && partIndex === words(line).at(-1)?.partIndex" class="rhyme-word" :style="{ backgroundColor: rhymeColor(index) }" :aria-expanded="activeLineId === line.id" @click="activeLineId = activeLineId === line.id ? null : line.id">{{ part.text }}</button><span v-else>{{ part.text }}</span><button v-if="part.syllables !== undefined" class="word-count" :title="`Edit syllables for ${part.text}`" @click="editingWord = editingWord?.lineId === line.id && editingWord.partIndex === partIndex ? null : { lineId: line.id, partIndex }">{{ part.syllables }}</button></template><span class="line-total">({{ lineSyllables(line) }})</span></p>
            <div v-if="editingWord?.lineId === line.id" class="inline-panel"><label class="text-sm text-stone-600">Syllables in “{{ line.parts[editingWord.partIndex].text }}” <input :value="line.parts[editingWord.partIndex].syllables" type="number" min="0" max="20" class="ml-2 w-16 rounded border border-stone-300 px-2 py-1 text-center" @input="setWordSyllables(line, line.parts[editingWord.partIndex], ($event.target as HTMLInputElement).value)"></label><button class="ml-2 text-sm text-stone-500 underline" @click="editingWord = null">Done</button><p v-if="/[éèê]$/i.test(line.parts[editingWord.partIndex].text)" class="mt-1 text-xs text-stone-500">The accented final vowel is counted as its own pronounced syllable.</p></div>
            <div v-if="activeLineId === line.id" class="inline-panel rhyme-panel"><div class="mb-2 flex items-center justify-between gap-3"><p class="text-sm font-semibold">Possible rhymes for <em>{{ finalWord(line) }}</em></p><button class="text-xs text-stone-500 underline" @click="activeLineId = null">Close</button></div><p class="mb-3 text-xs leading-5 text-stone-500">Only suggestions above 50% are shown. Estimates are based on spelling patterns, your prior judgments, and stanza position; reasons remain visible after a judgment.</p><div v-if="candidatePairs[index]?.length" class="space-y-2"><div v-for="candidate in candidatePairs[index]" :key="candidate.index" class="rounded-lg border border-stone-200 p-3"><div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p class="font-serif text-lg">{{ candidate.word }} <span class="font-sans text-xs text-stone-500">{{ candidate.probability }}% likely</span><span v-if="candidate.accepted" class="ml-2 font-sans text-xs font-medium text-green-700">Accepted</span></p><p v-for="reason in candidate.reasons" :key="reason" class="mt-1 text-xs leading-5 text-stone-600">{{ reason }}</p></div><div class="flex shrink-0 gap-2"><button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100" @click="setJudgment(index, candidate.index, true)">{{ candidate.accepted ? 'Likely rhyme ✓' : 'Likely rhyme' }}</button><button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200" @click="setJudgment(index, candidate.index, false)">Not a rhyme</button></div></div></div></div><p v-else class="text-sm text-stone-500">No other line endings in this stanza/section are above 50% likelihood.</p></div></div><button class="mt-5 text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button></div></div>
        <details class="mt-4 rounded-xl border border-stone-200 bg-white p-4"><summary class="cursor-pointer text-sm font-medium text-stone-700">Rhyme feedback</summary><p class="mt-2 text-xs leading-5 text-stone-500">Judgments are saved locally and used to generalize rhyme-tail patterns. They do not train a shared model.</p><div class="mt-3 flex flex-wrap gap-2"><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="exportFeedback">Export examples</button><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="feedbackFile?.click()">Import examples</button><input ref="feedbackFile" type="file" accept="application/json,.json" class="hidden" @change="importFeedback"></div><ul v-if="feedback.length" class="mt-3 flex flex-wrap gap-2"><li v-for="item in feedback" :key="pairKey(item.a, item.b)" class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs"><span>{{ item.a }} / {{ item.b }} — {{ item.rhymes ? 'rhyme' : 'not rhyme' }}</span><button class="text-stone-500 hover:text-red-700" title="Remove judgment" @click="forgetJudgment(item)">×</button></li></ul></details>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line{margin:0;min-height:1.9em;font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.1rem,2.4vw,1.35rem);line-height:1.9}.rhyme-word{border-radius:4px;padding:0 3px;font:inherit;font-style:italic;color:inherit}.rhyme-word:hover,.rhyme-word[aria-expanded=true]{outline:2px solid #9aaa9d;outline-offset:2px}.word-count{margin:0 2px 0 1px;vertical-align:super;font: .62rem ui-sans-serif,system-ui,sans-serif;color:#77736c}.word-count:hover{color:#315d45;text-decoration:underline}.line-total{white-space:nowrap;margin-left:4px;color:#77736c;font: .82em ui-sans-serif,system-ui,sans-serif}.stanza-break{margin-top:1.5rem}.inline-panel{margin:.5rem 0 1rem .25rem;border-left:2px solid #d6e0d6;padding:.25rem 0 .25rem .8rem}.rhyme-panel{max-width:760px;background:#fbfcfa;padding:.8rem;border-radius:.5rem}
@media print{body{background:white!important}header,button,details,.inline-panel{display:none!important}main{max-width:none!important;padding:0!important}.poem-line{font-size:13pt}.stanza-break{margin-top:1.2rem}}
</style>
