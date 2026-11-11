<script setup lang="ts">
type Line = { id: number; text: string; gap: boolean; syllables: number; stanzaBreak: boolean }
type RhymeFeedback = { a: string; b: string; rhymes: boolean }
type Candidate = { index: number; word: string; probability: number; reasons: string[]; judgment?: boolean }

const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' }, { value: 'ang', label: 'Anglo-Norman' }
]
const colors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const starterPairs = [
  ['pounde', 'grounde'], ['begynne', 'thinne'], ['be', 'yemanry'], ['stryfe', 'lyfe'], ['me', 'be'],
  ['disgrate', 'state'], ['ende', 'amende'], ['rychesse', 'kyndnesse'], ['ayre', 'fayre'], ['bolde', 'solde'], ['the', 'see'],
  ['tresouré', 'be'], ['the', 'poverté'], ['none', 'Johnn'], ['rowe', 'sawe'], ['Calveré', 'be'], ['day', 'Abbey'], ['contré', 'me'], ['ryvere', 'bryre']
]
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const feedbackFile = ref<HTMLInputElement | null>(null)
const activeLineId = ref<number | null>(null)
const editingSyllableId = ref<number | null>(null)
const feedback = ref<RhymeFeedback[]>([])
const feedbackReady = ref(false)
const hasPoem = computed(() => lines.value.length > 0)

function normalize(word: string) {
  return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
}
function finalWord(text: string) {
  const clean = text.trim().replace(/[^\p{L}\p{N}]+$/gu, '')
  return clean.match(/[\p{L}]+(?:[’'-][\p{L}]+)*$/u)?.[0] ?? ''
}
function pairKey(a: string, b: string) { return [normalize(a), normalize(b)].sort().join('|') }
function rhymeTail(text: string) {
  let word = normalize(finalWord(text))
  if (!word) return ''
  // Middle English final -e may be silent: gost / moste can share the written tail ost.
  if (word.length > 2 && word.endsWith('e') && !/[aeiouy]e$/.test(word)) word = word.slice(0, -1)
  // Treat historical y/i variation as a possible spelling variant, not a certainty.
  word = word.replace(/y/g, 'i')
  const vowelIndex = Math.max(word.lastIndexOf('a'), word.lastIndexOf('e'), word.lastIndexOf('i'), word.lastIndexOf('o'), word.lastIndexOf('u'))
  if (vowelIndex < 0) return word
  return word.slice(vowelIndex).replace(/([aeiou])\1+$/g, '$1')
}
function feedbackFor(a: string, b: string) {
  return feedback.value.find((item) => pairKey(item.a, item.b) === pairKey(a, b))
}
function rhymeReasons(a: string, b: string) {
  const left = normalize(a); const right = normalize(b); const reasons: string[] = []
  if (left.endsWith('e') !== right.endsWith('e')) reasons.push('Assumes a written final -e is silent in one word.')
  if ((/[y]$/.test(left) && /e$/.test(right)) || (/[y]$/.test(right) && /e$/.test(left))) reasons.push('Assumes final -y can have the same vowel sound as -e (as in “me”).')
  if (/[y]/.test(left + right) && left.replace(/y/g, 'i') === right.replace(/y/g, 'i')) reasons.push('Treats historical y/i spellings as possible variants.')
  if (!reasons.length) reasons.push('The words share a spelling-based rhyme tail; actual historical pronunciation is uncertain.')
  return reasons
}
onMounted(() => {
  try {
    const stored = localStorage.getItem('verse-rhyme-feedback')
    feedback.value = stored ? JSON.parse(stored) as RhymeFeedback[] : starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
  } catch { feedback.value = starterPairs.map(([a, b]) => ({ a, b, rhymes: true })) }
  feedbackReady.value = true
})
watch(feedback, (value) => {
  if (!feedbackReady.value) return
  try { localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value)) } catch { /* Continue to work when browser storage is unavailable. */ }
}, { deep: true })

const sectionIds = computed(() => {
  const hasStanzas = lines.value.some((line, index) => index > 0 && line.stanzaBreak)
  return lines.value.map((_, index) => hasStanzas
    ? lines.value.slice(0, index + 1).filter((line, at) => at > 0 && line.stanzaBreak).length
    : Math.floor(index / 4))
})
function sectionLineIndices(section: number) {
  return lines.value.map((_, i) => i).filter((i) => sectionIds.value[i] === section && !lines.value[i].gap)
}
function pairProbability(a: string, b: string, indexA: number, indexB: number): Candidate {
  const saved = feedbackFor(a, b)
  const tailA = rhymeTail(a); const tailB = rhymeTail(b)
  let probability = 18
  let reasons = rhymeReasons(a, b)
  if (tailA && tailA === tailB) {
    probability = 82
    reasons = rhymeReasons(a, b)
  } else if (tailA && tailB) {
    const shorter = tailA.length <= tailB.length ? tailA : tailB
    const longer = tailA.length > tailB.length ? tailA : tailB
    if (shorter.length >= 2 && longer.endsWith(shorter)) {
      probability = 58
      reasons = [...rhymeReasons(a, b), 'The shorter written rhyme tail is contained at the end of the other word.']
    }
  }
  const sameSection = sectionLineIndices(sectionIds.value[indexA])
  const positionA = sameSection.indexOf(indexA); const positionB = sameSection.indexOf(indexB)
  const scheme = likelyScheme.value
  if (scheme && positionA >= 0 && positionB >= 0 && positionA !== positionB && scheme.pattern[positionA] === scheme.pattern[positionB]) {
    probability = Math.max(probability, Math.min(78, 55 + Math.round(scheme.confidence * 0.23)))
    reasons = [...new Set([...reasons, `These line positions fit the poem’s repeated ${scheme.pattern} pattern.`])]
  }
  if (saved?.rhymes) {
    probability = 100
    // Keep the original phonological/spelling explanation visible after accepting a suggestion.
    reasons = [...new Set([...reasons, ...rhymeReasons(a, b), 'You marked this pair as a likely rhyme; this judgment is saved in this browser.'])]
  } else if (saved?.rhymes === false) {
    probability = 0
    reasons = [...new Set([...reasons, 'You marked this pair as not rhyming; this judgment is saved in this browser.'])]
  }
  return { index: indexB, word: b, probability, reasons, judgment: saved?.rhymes }
}
const candidatePairs = computed(() => lines.value.map((line, index) => {
  if (line.gap || !finalWord(line.text)) return []
  return sectionLineIndices(sectionIds.value[index]).filter((other) => other !== index).map((other) =>
    pairProbability(finalWord(line.text), finalWord(lines.value[other].text), index, other)
  ).filter((candidate) => candidate.probability > 50)
    .sort((a, b) => b.probability - a.probability)
}))
const rhymeGroups = computed(() => {
  const parent = lines.value.map((_, i) => i)
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const join = (a: number, b: number) => { parent[find(a)] = find(b) }
  for (let a = 0; a < lines.value.length; a++) {
    if (lines.value[a].gap) continue
    for (let b = a + 1; b < lines.value.length; b++) {
      if (lines.value[b].gap || sectionIds.value[a] !== sectionIds.value[b]) continue
      const pair = pairProbability(finalWord(lines.value[a].text), finalWord(lines.value[b].text), a, b)
      if (pair.probability > 50) join(a, b)
    }
  }
  const groups = new Map<number, number>()
  return lines.value.map((line, i) => {
    if (line.gap || !finalWord(line.text)) return null
    const root = find(i)
    if (!groups.has(root)) groups.set(root, groups.size)
    return groups.get(root)!
  })
})
const sectionPatterns = computed(() => [...new Set(sectionIds.value)].map((id) => {
  const indices = sectionLineIndices(id); const labels = new Map<number, string>()
  const pattern = indices.map((i) => {
    const group = rhymeGroups.value[i]
    if (group === null) return '?'
    if (!labels.has(group)) labels.set(group, String.fromCharCode(65 + labels.size % 26))
    return labels.get(group)!
  }).join('')
  return { id, indices, pattern }
}))
const likelyScheme = computed(() => {
  const patterns = sectionPatterns.value.filter((item) => item.pattern.length >= 2 && !item.pattern.includes('?'))
  if (!patterns.length) return null
  const counts = new Map<string, number>()
  patterns.forEach((item) => counts.set(item.pattern, (counts.get(item.pattern) ?? 0) + 1))
  const [pattern, count] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { pattern, confidence: Math.round(count / patterns.length * 100), sections: patterns.length }
})
const rhymeCounts = computed(() => {
  const counts = new Map<number, number>()
  rhymeGroups.value.forEach((group) => { if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1) })
  return counts
})
function rhymeColor(index: number) {
  const group = rhymeGroups.value[index]
  return group !== null && group !== undefined && (rhymeCounts.value.get(group) ?? 0) > 1 ? colors[group % colors.length] : 'transparent'
}
function setJudgment(indexA: number, indexB: number, rhymes: boolean) {
  const a = finalWord(lines.value[indexA].text); const b = finalWord(lines.value[indexB].text)
  if (!a || !b) return
  const key = pairKey(a, b)
  feedback.value = [...feedback.value.filter((item) => pairKey(item.a, item.b) !== key), { a, b, rhymes }]
}
function forgetJudgment(item: RhymeFeedback) { feedback.value = feedback.value.filter((entry) => pairKey(entry.a, entry.b) !== pairKey(item.a, item.b)) }
function exportFeedback() { download(new Blob([JSON.stringify(feedback.value, null, 2)], { type: 'application/json' }), 'verse-rhyme-feedback.json') }
function importFeedback(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as RhymeFeedback[]
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item.a !== 'string' || typeof item.b !== 'string' || typeof item.rhymes !== 'boolean')) throw new Error('Bad feedback')
      feedback.value = [...feedback.value.filter((old) => !parsed.some((item) => pairKey(old.a, old.b) === pairKey(item.a, item.b))), ...parsed]
    } catch { window.alert('Please choose a valid Verse rhyme-feedback JSON file.') }
  }
  reader.readAsText(file); input.value = ''
}
function countSyllables(text: string, lang: string) {
  const words = text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  let total = 0
  for (const word of words) {
    const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let count = 0; let inVowel = false
    for (const char of normalized) { const vowel = /[aeiouy]/i.test(char); if (vowel && !inVowel) count++; inVowel = vowel }
    if (['fr', 'fro', 'ang'].includes(lang) && count > 1 && /e$/.test(normalized)) count--
    else if (['en', 'enm'].includes(lang)) { if (count > 1 && /e$/.test(normalized) && !/(le|ye)$/.test(normalized)) count--; if (/[^aeiou]le$/.test(normalized)) count++ }
    total += Math.max(1, count)
  }
  return total
}
function makeLine(text: string, stanzaBreak = false): Line { return { id: nextId.value++, text, gap: false, syllables: countSyllables(text, language.value), stanzaBreak } }
function analyze() {
  let breakNext = false; const result: Line[] = []
  for (const raw of poemInput.value.split(/\r?\n/)) {
    if (!raw.trim()) { if (result.length) breakNext = true; continue }
    result.push(makeLine(raw.trim(), breakNext)); breakNext = false
  }
  lines.value = result; activeLineId.value = null
}
function changeSyllables(line: Line, value: string) { line.syllables = Math.max(0, Math.min(40, Number(value) || 0)) }
function addMissingLine(index = lines.value.length - 1) { lines.value.splice(index + 1, 0, { id: nextId.value++, text: '', gap: true, syllables: 0, stanzaBreak: false }) }
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader(); reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }; reader.readAsText(file); input.value = ''
}
function endingParts(text: string) { const word = finalWord(text); if (!word) return { before: text, word: '', after: '' }; const at = text.lastIndexOf(word); return { before: text.slice(0, at), word, after: text.slice(at + word.length) } }
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportHtml() {
  const body = lines.value.map((line, index) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const parts = endingParts(line.text); const rendered = parts.word ? `${escapeHtml(parts.before)}<em style="background:${rhymeColor(index)}">${escapeHtml(parts.word)}</em>${escapeHtml(parts.after)}` : escapeHtml(line.text)
    return `<p class="line">${rendered} <span class="count">(${line.syllables})</span></p>`
  }).join('\n')
  const title = escapeHtml(poemTitle.value || 'Untitled poem')
  download(new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px}.line{margin:0}.line em{font-style:italic;border-radius:3px;padding:1px 3px}.count{font:14px system-ui;color:#777}.missing{color:#986b32;font-style:italic}</style><h1>${title}</h1>${body}</html>`], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`)
}
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><a href="#top" class="flex items-center gap-3 no-underline"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></a><span class="text-sm text-stone-500">Poetry analysis</span></div></header>
    <main id="top" class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!hasPoem" class="mx-auto max-w-3xl"><p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1><p class="mt-3 text-stone-600">A readable poem view with syllable counts and in-place rhyme suggestions.</p><div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"><div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div><input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title"><label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label><textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas."></textarea><div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button></div></div><p class="mt-4 text-xs leading-5 text-stone-500">Only rhyme suggestions above 50% are shown. Click an ending to see the estimate and its reasoning.</p></section>
      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []; poemInput = ''">← New poem</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div><div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button></div></div>
        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm"><div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Click a line-ending word to inspect likely pairs. Click a count to edit syllables.</p><p v-if="likelyScheme" class="mt-2 text-sm text-[#315d45]">Likely rhyme scheme <strong>{{ likelyScheme.pattern }}</strong><span class="text-stone-500"> · {{ likelyScheme.confidence }}% of {{ likelyScheme.sections }} stanza/section patterns</span></p></div>
          <div class="px-5 py-5 sm:px-8 sm:py-7"><div v-for="(line, index) in lines" :key="line.id" class="poem-row" :class="line.stanzaBreak ? 'stanza-break' : ''"><p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line — position preserved</p><template v-else><p class="poem-line"><span>{{ endingParts(line.text).before }}</span><button v-if="endingParts(line.text).word" class="rhyme-word" :style="{ backgroundColor: rhymeColor(index) }" :aria-expanded="activeLineId === line.id" @click="activeLineId = activeLineId === line.id ? null : line.id">{{ endingParts(line.text).word }}</button><span>{{ endingParts(line.text).after }}</span> <button class="syllable-count" title="Edit syllable count" @click="editingSyllableId = editingSyllableId === line.id ? null : line.id">({{ line.syllables }})</button></p>
            <div v-if="editingSyllableId === line.id" class="inline-panel"><label class="text-sm text-stone-600">Syllables <input :value="line.syllables" type="number" min="0" max="40" class="ml-2 w-16 rounded border border-stone-300 px-2 py-1 text-center" @input="changeSyllables(line, ($event.target as HTMLInputElement).value)"></label><button class="ml-2 text-sm text-stone-500 underline" @click="editingSyllableId = null">Done</button></div>
            <div v-if="activeLineId === line.id" class="inline-panel rhyme-panel"><div class="mb-2 flex items-center justify-between gap-3"><p class="text-sm font-semibold">Possible rhymes for <em>{{ finalWord(line.text) }}</em></p><button class="text-xs text-stone-500 underline" @click="activeLineId = null">Close</button></div><p class="mb-3 text-xs leading-5 text-stone-500">Only suggestions above 50% are listed. These are heuristic estimates, not measured historical probabilities. The reasons remain visible after you record a judgment.</p><div v-if="candidatePairs[index]?.length" class="space-y-2"><div v-for="candidate in candidatePairs[index]" :key="candidate.index" class="rounded-lg border border-stone-200 p-3"><div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p class="font-serif text-lg">{{ candidate.word }} <span class="font-sans text-xs text-stone-500">{{ candidate.probability }}% likely</span><span v-if="candidate.judgment === true" class="ml-2 font-sans text-xs font-medium text-green-700">Accepted</span></p><p v-for="reason in candidate.reasons" :key="reason" class="mt-1 text-xs leading-5 text-stone-600">{{ reason }}</p></div><div class="flex shrink-0 gap-2"><button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100" @click="setJudgment(index, candidate.index, true)">{{ candidate.judgment === true ? 'Likely rhyme ✓' : 'Likely rhyme' }}</button><button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-200" @click="setJudgment(index, candidate.index, false)">Not a rhyme</button></div></div></div></div><p v-else class="text-sm text-stone-500">No other line endings in this stanza/section are above 50% likelihood.</p></div></template></div><button class="mt-5 text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button></div></div>
        <details class="mt-4 rounded-xl border border-stone-200 bg-white p-4"><summary class="cursor-pointer text-sm font-medium text-stone-700">Rhyme examples and feedback</summary><p class="mt-2 text-xs leading-5 text-stone-500">Your judgments are saved in this browser as exact word-pair guidance. Export or import examples to move them between browsers; they do not train a shared model.</p><div class="mt-3 flex flex-wrap gap-2"><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="exportFeedback">Export examples</button><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="feedbackFile?.click()">Import examples</button><input ref="feedbackFile" type="file" accept="application/json,.json" class="hidden" @change="importFeedback"></div><ul v-if="feedback.length" class="mt-3 flex flex-wrap gap-2"><li v-for="item in feedback" :key="pairKey(item.a, item.b)" class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs"><span>{{ item.a }} / {{ item.b }} — {{ item.rhymes ? 'rhyme' : 'not rhyme' }}</span><button class="text-stone-500 hover:text-red-700" title="Remove judgment" @click="forgetJudgment(item)">×</button></li></ul></details>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line{margin:0;min-height:1.9em;font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.1rem,2.4vw,1.35rem);line-height:1.9}.rhyme-word{border-radius:4px;padding:0 3px;font:inherit;font-style:italic;color:inherit}.rhyme-word:hover,.rhyme-word[aria-expanded=true]{outline:2px solid #9aaa9d;outline-offset:2px}.syllable-count{white-space:nowrap;color:#77736c;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.82em}.syllable-count:hover{color:#315d45;text-decoration:underline}.stanza-break{margin-top:1.5rem}.inline-panel{margin:.5rem 0 1rem .25rem;border-left:2px solid #d6e0d6;padding:.25rem 0 .25rem .8rem}.rhyme-panel{max-width:760px;background:#fbfcfa;padding:.8rem;border-radius:.5rem}
@media print{body{background:white!important}header,button,details,.inline-panel{display:none!important}main{max-width:none!important;padding:0!important}.poem-line{font-size:13pt}.stanza-break{margin-top:1.2rem}}
</style>
