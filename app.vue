<script setup lang="ts">
type Line = { id: number; text: string; gap: boolean; syllables: number; marks: string[]; foot: string; stanzaBreak: boolean }
type RhymeFeedback = { a: string; b: string; rhymes: boolean }
const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' }, { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' }, { value: 'ang', label: 'Anglo-Norman' }
]
const feet = ['Unspecified', 'Iamb', 'Trochee', 'Anapest', 'Dactyl', 'Spondee', 'Pyrrhic']
const colors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const starterPairs = [['tresouré', 'be'], ['the', 'poverté'], ['none', 'Johnn'], ['rowe', 'sawe'], ['Calveré', 'be'], ['day', 'Abbey'], ['contré', 'me'], ['ryvere', 'bryre']]
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const feedbackFile = ref<HTMLInputElement | null>(null)
const mode = ref<'read' | 'review'>('read')
const partners = ref<Record<number, number | ''>>({})
const feedback = ref<RhymeFeedback[]>([])
const feedbackReady = ref(false)
const hasPoem = computed(() => lines.value.length > 0)

function normalize(word: string) { return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '') }
function finalWord(text: string) {
  const clean = text.trim().replace(/[^\p{L}\p{N}]+$/gu, '')
  return clean.match(/[\p{L}]+(?:[’'-][\p{L}]+)*$/u)?.[0] ?? ''
}
function pairKey(a: string, b: string) { return [normalize(a), normalize(b)].sort().join('|') }
function rhymeKey(text: string) {
  const word = finalWord(text)
  if (!word) return ''
  let value = normalize(word)
  const vowel = /[aeiouy]/i
  // Heuristic only: approximate the written rhyme tail, retaining historic final -e.
  if (value.endsWith('e') && value.length > 1 && !vowel.test(value.at(-2)!)) {
    const stem = value.slice(0, -1)
    let start = stem.length - 1
    while (start > 0 && vowel.test(stem[start - 1])) start--
    value = `${stem.slice(start)}e`
  } else {
    let start = value.length - 1
    while (start > 0 && vowel.test(value[start - 1]) && vowel.test(value[start])) start--
    value = value.slice(start)
  }
  return value.replace(/y/g, 'i').replace(/([aeiou])\1+$/g, '$1')
}
function feedbackFor(a: string, b: string) { return feedback.value.find((item) => pairKey(item.a, item.b) === pairKey(a, b))?.rhymes }
onMounted(() => {
  try {
    const stored = localStorage.getItem('verse-rhyme-feedback')
    feedback.value = stored ? JSON.parse(stored) as RhymeFeedback[] : starterPairs.map(([a, b]) => ({ a, b, rhymes: true }))
  } catch { feedback.value = starterPairs.map(([a, b]) => ({ a, b, rhymes: true })) }
  feedbackReady.value = true
})
watch(feedback, (value) => { if (feedbackReady.value) localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value)) }, { deep: true })

const sections = computed(() => {
  const explicit = lines.value.some((line, index) => index > 0 && line.stanzaBreak)
  return lines.value.map((line, index) => explicit
    ? lines.value.slice(0, index + 1).filter((candidate, i) => i > 0 && candidate.stanzaBreak).length
    : Math.floor(index / 4))
})
const rhymeGroups = computed(() => {
  const parent = lines.value.map((_, i) => i)
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]))
  const join = (a: number, b: number) => { parent[find(a)] = find(b) }
  for (let a = 0; a < lines.value.length; a++) {
    const first = finalWord(lines.value[a].text)
    if (!first || lines.value[a].gap) continue
    for (let b = a + 1; b < lines.value.length; b++) {
      const second = finalWord(lines.value[b].text)
      if (!second || lines.value[b].gap || sections.value[a] !== sections.value[b]) continue
      const judgment = feedbackFor(first, second)
      if (judgment === true || (judgment === undefined && rhymeKey(lines.value[a].text) && rhymeKey(lines.value[a].text) === rhymeKey(lines.value[b].text))) join(a, b)
    }
  }
  const ids = new Map<number, number>()
  return lines.value.map((line, i) => {
    if (line.gap || !finalWord(line.text)) return null
    const root = find(i)
    if (!ids.has(root)) ids.set(root, ids.size)
    return ids.get(root)!
  })
})
const sectionDetails = computed(() => {
  const bySection = new Map<number, number[]>()
  sections.value.forEach((section, index) => bySection.set(section, [...(bySection.get(section) ?? []), index]))
  return [...bySection.entries()].map(([id, indices]) => {
    const labels = new Map<number, string>()
    const pattern = indices.map((i) => {
      const group = rhymeGroups.value[i]
      if (group === null) return '?'
      if (!labels.has(group)) labels.set(group, String.fromCharCode(65 + labels.size % 26))
      return labels.get(group)!
    }).join('')
    return { id, indices, pattern }
  })
})
const schemeSummary = computed(() => {
  const usable = sectionDetails.value.filter((section) => section.pattern.length >= 2 && !section.pattern.includes('?'))
  if (!usable.length) return null
  const counts = new Map<string, number>()
  usable.forEach((section) => counts.set(section.pattern, (counts.get(section.pattern) ?? 0) + 1))
  const [pattern, count] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { pattern, confidence: Math.round(count / usable.length * 100), samples: usable.length }
})
const groupCounts = computed(() => {
  const counts = new Map<number, number>()
  rhymeGroups.value.forEach((group) => { if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1) })
  return counts
})
function rhymeColor(index: number) {
  const group = rhymeGroups.value[index]
  return group !== null && group !== undefined && (groupCounts.value.get(group) ?? 0) > 1 ? colors[group % colors.length] : 'transparent'
}
function schemeFlag(index: number) {
  if (!schemeSummary.value) return false
  const section = sectionDetails.value.find((item) => item.indices.includes(index))
  if (!section || section.pattern.length !== schemeSummary.value.pattern.length || section.pattern.includes('?')) return false
  const position = index - section.indices[0]
  return section.pattern[position] !== schemeSummary.value.pattern[position]
}
function confirmPair(index: number, rhymes: boolean) {
  const chosen = partners.value[lines.value[index].id]
  if (chosen === '' || chosen === undefined) return
  const otherIndex = lines.value.findIndex((line) => line.id === Number(chosen))
  if (otherIndex < 0 || sections.value[index] !== sections.value[otherIndex]) return
  const a = finalWord(lines.value[index].text); const b = finalWord(lines.value[otherIndex].text)
  if (!a || !b) return
  const key = pairKey(a, b)
  feedback.value = [...feedback.value.filter((item) => pairKey(item.a, item.b) !== key), { a, b, rhymes }]
}
function deleteFeedback(item: RhymeFeedback) { feedback.value = feedback.value.filter((entry) => pairKey(entry.a, entry.b) !== pairKey(item.a, item.b)) }
function downloadFeedback() { download(new Blob([JSON.stringify(feedback.value, null, 2)], { type: 'application/json' }), 'verse-rhyme-feedback.json') }
function importFeedback(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as RhymeFeedback[]
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item.a !== 'string' || typeof item.b !== 'string' || typeof item.rhymes !== 'boolean')) throw new Error('Invalid feedback file')
      feedback.value = [...feedback.value.filter((old) => !parsed.some((item) => pairKey(old.a, old.b) === pairKey(item.a, item.b))), ...parsed]
    } catch { window.alert('Could not import this feedback file. Please choose a Verse rhyme-feedback JSON export.') }
  }
  reader.readAsText(file); input.value = ''
}
function countSyllables(text: string, lang: string) {
  const words = text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  let total = 0
  for (const word of words) {
    const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let count = 0; let inVowel = false
    for (const char of normalized) { const isVowel = /[aeiouy]/i.test(char); if (isVowel && !inVowel) count++; inVowel = isVowel }
    if (['fr', 'fro', 'ang'].includes(lang) && count > 1 && /e$/.test(normalized)) count--
    else if (['en', 'enm'].includes(lang)) { if (count > 1 && /e$/.test(normalized) && !/(le|ye)$/.test(normalized)) count--; if (/[^aeiou]le$/.test(normalized)) count++ }
    total += Math.max(1, count)
  }
  return total
}
function makeLine(text: string, stanzaBreak = false): Line { const syllables = countSyllables(text, language.value); return { id: nextId.value++, text, gap: false, syllables, marks: Array(syllables).fill('·'), foot: 'Unspecified', stanzaBreak } }
function analyze() {
  let breakNext = false; const result: Line[] = []
  for (const raw of poemInput.value.split(/\r?\n/)) {
    if (!raw.trim()) { if (result.length) breakNext = true; continue }
    result.push(makeLine(raw.trim(), breakNext)); breakNext = false
  }
  lines.value = result
}
function updateSyllables(line: Line, value: string | number) { line.syllables = Math.max(0, Math.min(40, Number(value) || 0)); line.marks = Array.from({ length: line.syllables }, (_, i) => line.marks[i] ?? '·') }
function cycleMark(line: Line, index: number) { const options = ['·', '˘', '′']; line.marks[index] = options[(options.indexOf(line.marks[index] ?? '·') + 1) % options.length] }
function markName(mark: string, index: number) { return `${mark === '·' ? 'Unset' : mark === '˘' ? 'Unstressed' : 'Stressed'} syllable ${index + 1}` }
function addGap(index = lines.value.length - 1) { lines.value.splice(index + 1, 0, { id: nextId.value++, text: '', gap: true, syllables: 0, marks: [], foot: 'Unspecified', stanzaBreak: false }) }
function onFileChange(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }; reader.readAsText(file); input.value = '' }
function endingParts(text: string) { const word = finalWord(text); if (!word) return { before: text, word: '', after: '' }; const start = text.lastIndexOf(word); return { before: text.slice(0, start), word, after: text.slice(start + word.length) } }
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportHtml() {
  const body = lines.value.map((line, i) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const parts = endingParts(line.text); const ending = parts.word ? `${escapeHtml(parts.before)}<em style="background:${rhymeColor(i)}">${escapeHtml(parts.word)}</em>${escapeHtml(parts.after)}` : escapeHtml(line.text)
    return `<p class="line">${ending} <span class="count">(${line.syllables})</span></p>`
  }).join('\n')
  const title = escapeHtml(poemTitle.value || 'Untitled poem')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px;color:#24231f}.line{margin:0}.line em{font-style:italic;border-radius:3px;padding:1px 3px}.count{font:14px system-ui;color:#777}.missing{color:#986b32;font-style:italic}</style><h1>${title}</h1>${body}</html>`
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`)
}
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white"><div class="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8"><a href="#top" class="flex items-center gap-3 no-underline"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></a><span class="text-sm text-stone-500">Poetry analysis</span></div></header>
    <main id="top" class="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!hasPoem" class="mx-auto max-w-3xl"><p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1><p class="mt-3 text-stone-600">Paste a poem to see syllable counts and review likely rhymes.</p><div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"><div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div><input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title"><label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label><textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="Each verse line on its own line; blank lines mark stanzas."></textarea><div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button></div></div><p class="mt-4 text-xs text-stone-500">Rhyme guesses are approximate. Your manual rhyme judgments are stored locally and can be exported or imported.</p></section>
      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []">← Back</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div><div class="flex flex-wrap gap-2"><div class="inline-flex rounded-lg border border-stone-300 bg-white p-1"><button class="rounded px-3 py-1.5 text-sm" :class="mode === 'read' ? 'bg-[#e9eee8] font-semibold text-[#274f3b]' : 'text-stone-600'" @click="mode = 'read'">Read</button><button class="rounded px-3 py-1.5 text-sm" :class="mode === 'review' ? 'bg-[#e9eee8] font-semibold text-[#274f3b]' : 'text-stone-600'" @click="mode = 'review'">Review</button></div><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button></div></div>
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article class="rounded-2xl border border-stone-200 bg-white shadow-sm"><div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Syllable counts follow each line. Only confirmed or locally matched end words are colored.</p></div><div class="px-5 py-5 sm:px-8 sm:py-7"><div v-for="(line, index) in lines" :key="line.id" class="line-row" :class="line.stanzaBreak ? 'stanza-break' : ''"><p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line — position preserved</p><template v-else><p class="poem-line"><span>{{ endingParts(line.text).before }}</span><em v-if="endingParts(line.text).word" class="rhyme-end" :style="{ backgroundColor: rhymeColor(index) }">{{ endingParts(line.text).word }}</em><span>{{ endingParts(line.text).after }}</span> <span class="syllable-count">({{ line.syllables }})</span><span v-if="schemeFlag(index)" class="ml-1 text-xs font-sans text-red-700" title="This section differs from the most common rhyme pattern">⚑</span></p>
            <div v-if="mode === 'review'" class="review-line"><div class="flex flex-wrap items-center gap-3 text-sm text-stone-600"><label class="flex items-center gap-2">Syllables<input :value="line.syllables" type="number" min="0" max="40" class="w-16 rounded border border-stone-200 px-2 py-1 text-center text-stone-900" @input="updateSyllables(line, ($event.target as HTMLInputElement).value)"></label><label class="flex items-center gap-2">Foot<select v-model="line.foot" class="rounded border border-stone-200 bg-white px-2 py-1 text-stone-900"><option v-for="foot in feet" :key="foot">{{ foot }}</option></select></label><button class="text-xs text-stone-500 hover:text-red-700" @click="lines.splice(index, 1)">Remove</button></div>
              <div class="mt-3 flex flex-wrap items-center gap-2"><span class="text-xs font-medium uppercase tracking-wide text-stone-500">Compare endings</span><select v-model="partners[line.id]" class="min-w-40 rounded border border-stone-200 bg-white px-2 py-1.5 text-sm"><option value="">Choose a line</option><option v-for="(other, otherIndex) in lines" v-if="otherIndex !== index && !other.gap && sections[otherIndex] === sections[index]" :key="other.id" :value="other.id">{{ finalWord(other.text) }}</option></select><button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800 hover:bg-green-100" @click="confirmPair(index, true)">Likely rhyme</button><button class="rounded bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100" @click="confirmPair(index, false)">Not a rhyme</button></div>
              <div class="mt-3 flex flex-wrap items-center gap-1" aria-label="Scansion marks"><span class="mr-1 text-xs font-medium uppercase tracking-wide text-stone-500">Scansion</span><button v-for="(mark, mi) in line.marks" :key="mi" class="grid h-8 w-8 place-items-center rounded border border-stone-200 text-lg hover:border-[#52715d]" :class="mark === '′' ? 'bg-[#e9eee8] text-[#274f3b]' : 'text-stone-500'" :aria-label="markName(mark, mi)" :title="markName(mark, mi)" @click="cycleMark(line, mi)">{{ mark === '·' ? '○' : mark }}</button><span class="ml-2 self-center text-xs text-stone-400">Click a mark to cycle unset / unstressed / stressed</span></div><label class="mt-3 block text-xs text-stone-500">Edit this line<input v-model="line.text" class="mt-1 w-full rounded border border-stone-200 px-2 py-1.5 font-serif text-base text-stone-900"></label>
            </div></template></div><button class="mt-5 text-sm font-medium text-[#315d45] hover:underline" @click="addGap()">+ Add missing line</button></div></article>
          <aside v-if="mode === 'review'" class="h-fit space-y-4"><section class="rounded-2xl border border-stone-200 bg-white p-5"><p class="text-xs font-semibold uppercase tracking-[.16em] text-[#52715d]">Rhyme review</p><h3 v-if="schemeSummary" class="mt-2 text-2xl font-semibold">{{ schemeSummary.pattern }}</h3><p v-if="schemeSummary" class="mt-1 text-sm text-stone-600">Most common pattern in {{ schemeSummary.confidence }}% of {{ schemeSummary.samples }} analyzed sections.</p><p v-else class="mt-2 text-sm leading-6 text-stone-600">Add or preserve stanza breaks to compare patterns across sections. Without breaks, the poem is grouped in four-line sections.</p><p class="mt-3 text-xs leading-5 text-stone-500">A red flag marks a section that differs from the most common pattern. It may be a variant rhyme, a missing line, or a genuine exception.</p></section><section class="rounded-2xl border border-stone-200 bg-white p-5"><div class="flex items-start justify-between gap-3"><div><h3 class="font-semibold">Your rhyme judgments</h3><p class="mt-1 text-xs leading-5 text-stone-500">Saved in this browser and reused as exact-pair guidance. No shared model is trained.</p></div></div><div class="mt-3 flex flex-wrap gap-2"><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs hover:bg-stone-50" @click="downloadFeedback">Export examples</button><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs hover:bg-stone-50" @click="feedbackFile?.click()">Import examples</button><input ref="feedbackFile" type="file" accept="application/json,.json" class="hidden" @change="importFeedback"></div><ul v-if="feedback.length" class="mt-3 max-h-64 space-y-2 overflow-auto text-sm"><li v-for="item in feedback" :key="pairKey(item.a, item.b)" class="flex items-center justify-between gap-2 rounded bg-stone-50 px-2.5 py-2"><span>{{ item.a }} / {{ item.b }}</span><span class="flex items-center gap-2"><span :class="item.rhymes ? 'text-green-700' : 'text-red-700'">{{ item.rhymes ? 'rhyme' : 'not rhyme' }}</span><button class="text-stone-400 hover:text-red-700" title="Remove judgment" @click="deleteFeedback(item)">×</button></span></li></ul></section></aside>
          <aside v-else class="h-fit rounded-2xl bg-[#e9eee8] p-5"><h3 class="font-semibold">Review when ready</h3><p class="mt-2 text-sm leading-6 text-stone-600">Switch to Review to mark stress, adjust syllables, compare line endings, and record rhyme judgments. Your labels help future suggestions in this browser.</p><button class="mt-4 rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="mode = 'review'">Open review tools</button></aside>
        </div><p class="mt-4 text-xs leading-5 text-stone-500">Rhyme and syllable estimates are suggestions, especially for historical forms. Manually confirmed pairs override the heuristic.</p>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line{margin:0;min-height:1.85em;font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.05rem,2.2vw,1.3rem);line-height:1.85}.rhyme-end{border-radius:3px;padding:0 2px;font-style:italic}.syllable-count{white-space:nowrap;color:#77736c;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.82em}.stanza-break{margin-top:1.4rem}.review-line{margin:.5rem 0 1rem .25rem;border-left:2px solid #e7e5e4;padding:.2rem 0 .4rem .8rem}
@media print{body{background:white!important}header,button,aside,.review-line,.text-xs{display:none!important}main{max-width:none!important;padding:0!important}.poem-line{font-size:13pt}.stanza-break{margin-top:1.2rem}}
</style>
