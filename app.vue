<script setup lang="ts">
type Line = {
  id: number
  text: string
  gap: boolean
  syllables: number
  marks: string[]
  foot: string
  stanzaBreak: boolean
}
type RhymeFeedback = { a: string; b: string; rhymes: boolean }

const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' }, { value: 'it', label: 'Italian' },
  { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' },
  { value: 'ang', label: 'Anglo-Norman' }
]
const feet = ['Unspecified', 'Iamb', 'Trochee', 'Anapest', 'Dactyl', 'Spondee', 'Pyrrhic']
const rhymeColors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
// These user-provided examples are initial positive feedback for this browser's rhyme suggestions.
const starterPairs = [
  ['tresouré', 'be'], ['the', 'poverté'], ['none', 'Johnn'], ['rowe', 'sawe'],
  ['Calveré', 'be'], ['day', 'Abbey'], ['contré', 'me'], ['ryvere', 'bryre']
]
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const showTools = ref(false)
const isAnalyzed = computed(() => lines.value.length > 0)
const selectedPartners = ref<Record<number, number | ''>>({})
const rhymeFeedback = ref<RhymeFeedback[]>([])
const feedbackLoaded = ref(false)

function normalizeWord(word: string) {
  return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
}
function finalWord(text: string) {
  const clean = text.trim().replace(/[^\p{L}\p{N}]+$/gu, '')
  return clean.match(/[\p{L}]+(?:[’'-][\p{L}]+)*$/u)?.[0] ?? ''
}
function pairKey(a: string, b: string) {
  return [normalizeWord(a), normalizeWord(b)].sort().join('|')
}
function rhymeKey(text: string) {
  const word = finalWord(text)
  if (!word) return ''
  let value = normalizeWord(word)
  const vowels = /[aeiouy]/i
  // Approximate the final stressed-vowel sequence, including historical final -e spellings.
  if (value.endsWith('e') && value.length > 1 && !vowels.test(value.at(-2)!)) {
    const stem = value.slice(0, -1)
    let start = stem.length - 1
    while (start > 0 && vowels.test(stem[start - 1])) start--
    value = `${stem.slice(start)}e`
  } else {
    let start = value.length - 1
    while (start > 0 && vowels.test(value[start - 1]) && vowels.test(value[start])) start--
    value = value.slice(start)
  }
  value = value.replace(/y/g, 'i').replace(/([aeiou])\1+$/g, '$1')
  // One-letter vowel endings are too ambiguous for automatic coloring; users can confirm them manually.
  return value.length > 1 ? value : ''
}
function feedbackFor(a: string, b: string) {
  const key = pairKey(a, b)
  return rhymeFeedback.value.find((item) => pairKey(item.a, item.b) === key)?.rhymes
}

onMounted(() => {
  try {
    const saved = localStorage.getItem('verse-rhyme-feedback')
    rhymeFeedback.value = saved ? JSON.parse(saved) as RhymeFeedback[] : starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
  } catch {
    rhymeFeedback.value = starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
  }
  feedbackLoaded.value = true
})
watch(rhymeFeedback, (value) => {
  if (feedbackLoaded.value) localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value))
}, { deep: true })

function sectionIds() {
  const explicitStanzas = lines.value.some((line, index) => index > 0 && line.stanzaBreak)
  return lines.value.map((line, index) => explicitStanzas
    ? lines.value.slice(0, index + 1).filter((candidate, candidateIndex) => candidateIndex > 0 && candidate.stanzaBreak).length
    : Math.floor(index / 4))
}
const lineSections = computed(sectionIds)
const rhymeGroups = computed(() => {
  const parents = lines.value.map((_, index) => index)
  const find = (value: number): number => parents[value] === value ? value : (parents[value] = find(parents[value]))
  const unite = (a: number, b: number) => { parents[find(a)] = find(b) }
  const words = lines.value.map((line) => finalWord(line.text))

  for (let a = 0; a < lines.value.length; a++) {
    if (!words[a] || lines.value[a].gap) continue
    for (let b = a + 1; b < lines.value.length; b++) {
      if (!words[b] || lines.value[b].gap || lineSections.value[a] !== lineSections.value[b]) continue
      const feedback = feedbackFor(words[a], words[b])
      if (feedback === true || (feedback === undefined && rhymeKey(lines.value[a].text) && rhymeKey(lines.value[a].text) === rhymeKey(lines.value[b].text))) unite(a, b)
    }
  }
  const ids = new Map<number, number>()
  return lines.value.map((line, index) => {
    if (line.gap || !words[index]) return null
    const root = find(index)
    if (!ids.has(root)) ids.set(root, ids.size)
    return ids.get(root)!
  })
})
const sectionDetails = computed(() => {
  const sections = new Map<number, number[]>()
  lineSections.value.forEach((section, index) => sections.set(section, [...(sections.get(section) ?? []), index]))
  return [...sections.entries()].map(([id, indices]) => {
    const groupLabels = new Map<number, string>()
    const pattern = indices.map((index) => {
      const group = rhymeGroups.value[index]
      if (group === null) return '?'
      if (!groupLabels.has(group)) groupLabels.set(group, String.fromCharCode(65 + groupLabels.size % 26))
      return groupLabels.get(group)!
    }).join('')
    return { id, indices, pattern }
  })
})
const dominantScheme = computed(() => {
  const candidates = sectionDetails.value.filter((section) => section.pattern.length >= 2 && !section.pattern.includes('?'))
  if (!candidates.length) return null
  const counts = new Map<string, number>()
  for (const section of candidates) counts.set(section.pattern, (counts.get(section.pattern) ?? 0) + 1)
  const [pattern, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return { pattern, confidence: Math.round(count / candidates.length * 100), samples: candidates.length }
})
const rhymeCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const group of rhymeGroups.value) if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1)
  return counts
})
function rhymeColor(index: number) {
  const group = rhymeGroups.value[index]
  return group !== null && group !== undefined && (rhymeCounts.value.get(group) ?? 0) > 1
    ? rhymeColors[group % rhymeColors.length]
    : 'transparent'
}
function hasSchemeFlag(index: number) {
  const dominant = dominantScheme.value
  const section = sectionDetails.value.find((item) => item.indices.includes(index))
  if (!dominant || !section || section.pattern.length !== dominant.pattern.length || section.pattern.includes('?')) return false
  return section.pattern[index - section.indices[0]] !== dominant.pattern[index - section.indices[0]]
}
function recordPair(lineIndex: number, rhymes: boolean) {
  const targetId = selectedPartners.value[lines.value[lineIndex].id]
  if (targetId === undefined || targetId === '') return
  const partnerIndex = lines.value.findIndex((line) => line.id === Number(targetId))
  if (partnerIndex < 0 || lineSections.value[partnerIndex] !== lineSections.value[lineIndex]) return
  const a = finalWord(lines.value[lineIndex].text)
  const b = finalWord(lines.value[partnerIndex].text)
  if (!a || !b) return
  const key = pairKey(a, b)
  rhymeFeedback.value = [...rhymeFeedback.value.filter((item) => pairKey(item.a, item.b) !== key), { a, b, rhymes }]
}
function forgetPair(item: RhymeFeedback) {
  rhymeFeedback.value = rhymeFeedback.value.filter((entry) => pairKey(entry.a, entry.b) !== pairKey(item.a, item.b))
}
function exportFeedback() {
  download(new Blob([JSON.stringify(rhymeFeedback.value, null, 2)], { type: 'application/json' }), 'verse-rhyme-feedback.json')
}
function countSyllables(text: string, lang: string) {
  const words = text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  let total = 0
  for (const word of words) {
    const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let count = 0
    let inVowel = false
    for (const char of normalized) {
      const vowel = /[aeiouy]/i.test(char)
      if (vowel && !inVowel) count++
      inVowel = vowel
    }
    if (['fr', 'fro', 'ang'].includes(lang)) {
      if (count > 1 && /e$/.test(normalized)) count--
    } else if (['en', 'enm'].includes(lang)) {
      if (count > 1 && /e$/.test(normalized) && !/(le|ye)$/.test(normalized)) count--
      if (/[^aeiou]le$/.test(normalized)) count++
    }
    total += Math.max(1, count)
  }
  return total
}
function makeLine(text: string, stanzaBreak = false): Line {
  const syllables = countSyllables(text, language.value)
  return { id: nextId.value++, text, gap: false, syllables, marks: Array(syllables).fill('·'), foot: 'Unspecified', stanzaBreak }
}
function analyze() {
  let stanzaBreak = false
  const result: Line[] = []
  for (const raw of poemInput.value.split(/\r?\n/)) {
    if (!raw.trim()) { if (result.length) stanzaBreak = true; continue }
    result.push(makeLine(raw.trim(), stanzaBreak))
    stanzaBreak = false
  }
  lines.value = result
}
function updateSyllables(line: Line, value: string | number) {
  line.syllables = Math.max(0, Math.min(40, Number(value) || 0))
  line.marks = Array.from({ length: line.syllables }, (_, i) => line.marks[i] ?? '·')
}
function cycleMark(line: Line, index: number) {
  const cycle = ['·', '˘', '′']
  line.marks[index] = cycle[(cycle.indexOf(line.marks[index] ?? '·') + 1) % cycle.length]
}
function markLabel(mark: string, index: number) {
  return `${mark === '·' ? 'Unset' : mark === '˘' ? 'Unstressed' : 'Stressed'} syllable ${index + 1}`
}
function addMissingLine(index = lines.value.length - 1) {
  lines.value.splice(index + 1, 0, { id: nextId.value++, text: '', gap: true, syllables: 0, marks: [], foot: 'Unspecified', stanzaBreak: false })
}
function removeLine(index: number) { lines.value.splice(index, 1) }
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }
  reader.readAsText(file)
  input.value = ''
}
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
}
function endingParts(text: string) {
  const word = finalWord(text)
  if (!word) return { before: text, word: '', after: '' }
  const start = text.lastIndexOf(word)
  return { before: text.slice(0, start), word, after: text.slice(start + word.length) }
}
function exportHtml() {
  const body = lines.value.map((line, index) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const parts = endingParts(line.text)
    const end = parts.word ? `${escapeHtml(parts.before)}<em style="background:${rhymeColor(index)}">${escapeHtml(parts.word)}</em>${escapeHtml(parts.after)}` : escapeHtml(line.text)
    return `<p class="line">${end} <span class="count">(${line.syllables})</span></p>`
  }).join('\n')
  const title = escapeHtml(poemTitle.value || 'Untitled poem')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px;color:#24231f}.line{margin:0}.line em{font-style:italic;border-radius:3px;padding:1px 3px}.count{font:14px ui-sans-serif,system-ui;color:#777}.missing{color:#986b32;font-style:italic}</style><h1>${title}</h1>${body}</html>`
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`)
}
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <a href="#top" class="flex items-center gap-3 no-underline"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></a>
        <span class="text-sm text-stone-500">Poetry analysis</span>
      </div>
    </header>
    <main id="top" class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!isAnalyzed" class="mx-auto max-w-3xl">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1>
        <p class="mt-3 text-stone-600">Paste a poem to see line-by-line syllable counts and likely local rhymes.</p>
        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div>
          <input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5 outline-none focus:border-[#52715d]" placeholder="Poem title">
          <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
          <textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7 outline-none focus:border-[#52715d]" placeholder="Paste each verse line on its own line. Leave a blank line between stanzas."></textarea>
          <div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1d3d2c] disabled:opacity-40" @click="analyze">Analyze poem →</button></div>
        </div>
        <p class="mt-4 text-xs leading-5 text-stone-500">Rhyme guesses are approximate. Confirmed and rejected word pairs are saved in this browser to improve future suggestions.</p>
      </section>
      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []">← Back</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div>
          <div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="showTools = !showTools">{{ showTools ? 'Hide tools' : 'Rhyme & scansion tools' }}</button><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d3d2c]" @click="exportPdf">Save PDF</button></div>
        </div>
        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Only matched end words are colored. Rhyme analysis stays within stanzas or four-line sections.</p><p v-if="dominantScheme" class="mt-2 text-sm font-medium text-[#315d45]">Likely scheme: {{ dominantScheme.pattern }} <span class="font-normal text-stone-500">({{ dominantScheme.confidence }}% of {{ dominantScheme.samples }} sections)</span></p></div>
          <div class="px-5 py-5 sm:px-8 sm:py-7">
            <div v-for="(line, index) in lines" :key="line.id" class="line-row" :class="line.stanzaBreak ? 'stanza-break' : ''">
              <template v-if="line.gap"><p class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line — position preserved</p></template>
              <template v-else>
                <p class="poem-line"><span>{{ endingParts(line.text).before }}</span><em v-if="endingParts(line.text).word" class="rhyme-end" :class="hasSchemeFlag(index) ? 'rhyme-flag' : ''" :style="{ backgroundColor: rhymeColor(index) }">{{ endingParts(line.text).word }}</em><span>{{ endingParts(line.text).after }}</span> <span class="syllable-count">({{ line.syllables }})</span><span v-if="hasSchemeFlag(index)" class="ml-1 text-xs font-sans text-red-700" title="This line differs from the most common section scheme">⚑</span></p>
                <div v-if="showTools" class="ml-1 mt-2 border-l-2 border-stone-100 pl-3">
                  <div class="flex flex-wrap items-center gap-3 text-sm text-stone-600"><label class="flex items-center gap-2">Syllables<input :value="line.syllables" type="number" min="0" max="40" class="w-16 rounded border border-stone-200 px-2 py-1 text-center text-stone-900" @input="updateSyllables(line, ($event.target as HTMLInputElement).value)"></label><label class="flex items-center gap-2">Foot<select v-model="line.foot" class="rounded border border-stone-200 bg-white px-2 py-1 text-stone-900"><option v-for="foot in feet" :key="foot">{{ foot }}</option></select></label><button class="text-stone-500 hover:text-red-700" @click="removeLine(index)">Remove line</button><button class="text-stone-500 hover:text-[#315d45]" @click="addMissingLine(index)">Insert missing line after</button></div>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-sm"><label class="text-stone-600">Compare this ending with<select v-model="selectedPartners[line.id]" class="ml-2 max-w-64 rounded border border-stone-200 bg-white px-2 py-1"><option value="">Choose a line in this section</option><option v-for="(other, otherIndex) in lines" v-if="otherIndex !== index && !other.gap && lineSections[otherIndex] === lineSections[index]" :key="other.id" :value="other.id">{{ finalWord(other.text) || 'Line ending' }}</option></select></label><button class="rounded bg-green-50 px-2 py-1 font-medium text-green-800 hover:bg-green-100" @click="recordPair(index, true)">Likely rhyme</button><button class="rounded bg-red-50 px-2 py-1 font-medium text-red-800 hover:bg-red-100" @click="recordPair(index, false)">Not a rhyme</button></div>
                  <div class="mt-2 flex flex-wrap gap-1" aria-label="Scansion marks"><button v-for="(mark, mi) in line.marks" :key="mi" class="grid h-7 w-7 place-items-center rounded border border-stone-200 text-base hover:border-[#52715d]" :class="mark === '′' ? 'bg-[#e9eee8] text-[#274f3b]' : 'text-stone-500'" :aria-label="markLabel(mark, mi)" @click="cycleMark(line, mi)">{{ mark === '·' ? '○' : mark }}</button><span class="ml-1 self-center text-xs text-stone-400">Click: unset → unstressed → stressed</span></div>
                  <label class="mt-2 block text-sm text-stone-600">Edit line<input v-model="line.text" class="ml-2 w-full max-w-xl rounded border border-stone-200 px-2 py-1 font-serif text-base text-stone-900 sm:w-auto"></label>
                </div>
              </template>
            </div>
            <div class="mt-5 flex flex-wrap items-center gap-4 border-t border-stone-100 pt-4"><button class="text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button></div>
          </div>
        </div>
        <section v-if="showTools" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><h3 class="font-semibold">Your rhyme feedback</h3><p class="mt-1 text-sm text-stone-500">Saved locally in this browser and used for later suggestions.</p></div><button class="rounded border border-stone-300 px-3 py-2 text-sm hover:bg-stone-50" @click="exportFeedback">Export feedback</button></div><ul v-if="rhymeFeedback.length" class="mt-3 flex flex-wrap gap-2"> <li v-for="item in rhymeFeedback" :key="pairKey(item.a, item.b)" class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-sm"><span>{{ item.a }} / {{ item.b }} — {{ item.rhymes ? 'rhyme' : 'not rhyme' }}</span><button class="text-stone-500 hover:text-red-700" aria-label="Remove feedback" @click="forgetPair(item)">×</button></li></ul></section>
        <p class="mt-4 text-xs leading-5 text-stone-500">Feedback personalizes suggestions in this browser; export it to keep or share your labeled examples. It does not update a shared model.</p>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line { margin: 0; min-height: 1.85em; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.05rem, 2.2vw, 1.3rem); line-height: 1.85; }
.rhyme-end { border-radius: 3px; padding: 0 2px; font-style: italic; }
.rhyme-flag { outline: 2px solid #dc2626; outline-offset: 2px; }
.syllable-count { white-space: nowrap; color: #77736c; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .82em; }
.stanza-break { margin-top: 1.4rem; }
@media print {
  body { background: white !important; }
  header, button, .text-xs, .line-row > div, main > section > div:first-child > div, main > section > section { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .poem-line { font-size: 13pt; }
  .stanza-break { margin-top: 1.2rem; }
}
</style>
