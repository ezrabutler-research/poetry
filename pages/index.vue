<script setup lang="ts">
import {
  analyzeText,
  buildCandidates,
  buildPairDictionary,
  buildRhymeGroups,
  buildVowelCorrespondences,
  escapeHtml,
  finalWord,
  languageOptions,
  lineText,
  lineTotal,
  pairKey,
  rhymeTail,
  saveJudgment,
  type PoemLine,
  type RhymeFeedback,
  type SavedText,
} from '~/composables/usePoetryAnalyzer'

const title = ref('')
const language = ref('enm')
const sourceUrl = ref('')
const period = ref('')
const year = ref('')
const input = ref('')
const lines = ref<PoemLine[]>([])
const savedTexts = ref<SavedText[]>([])
const feedback = ref<RhymeFeedback[]>([])
const status = ref('')
const activePairIndex = ref<number | null>(null)

const analyzed = computed(() => lines.value.length > 0)
const rhymeGroups = computed(() => buildRhymeGroups(lines.value))
const pairDictionary = computed(() => buildPairDictionary(lines.value, feedback.value))
const vowelCorrespondences = computed(() => buildVowelCorrespondences(lines.value, feedback.value))
const candidates = computed(() => buildCandidates(lines.value, feedback.value))

const rhymePalette = ['#b8e3c2', '#b9d6ff', '#ffd2ae', '#f5dc82', '#d2c1f3', '#f3b9d2', '#b6e4e6']
const rhymeGroupColors = computed(() => {
  const map = new Map<string, string>()
  rhymeGroups.value.forEach(([tail], index) => map.set(tail, rhymePalette[index % rhymePalette.length]))
  return map
})

const rhymeScheme = computed(() => {
  const seen = new Map<string, string>()
  let next = 0
  return lines.value.map((line) => {
    const word = finalWord(line)
    if (!word) return '—'
    const tail = rhymeTail(word)
    if (!seen.has(tail)) {
      seen.set(tail, String.fromCharCode(65 + next))
      next += 1
    }
    return seen.get(tail)!
  })
})

function analyze() {
  if (!input.value.trim()) {
    status.value = 'Enter a poem before analyzing it.'
    return
  }
  lines.value = analyzeText(input.value, language.value)
  activePairIndex.value = null
  status.value = ''
}

function newPoem() {
  lines.value = []
  activePairIndex.value = null
  status.value = ''
}

function saveText() {
  const text = analyzed.value ? lines.value.map(lineText).join('\n') : input.value
  if (!text.trim()) {
    status.value = 'Enter text before saving.'
    return
  }
  if (sourceUrl.value.trim()) {
    try {
      const parsed = new URL(sourceUrl.value)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid url')
    } catch {
      status.value = 'Use a valid http or https source URL, or leave it blank.'
      return
    }
  }
  const item: SavedText = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: title.value.trim() || 'Untitled poem',
    text,
    language: language.value,
    sourceUrl: sourceUrl.value.trim(),
    period: period.value.trim(),
    year: year.value.trim(),
    updatedAt: Date.now(),
  }
  savedTexts.value = [item, ...savedTexts.value.filter((entry) => entry.id !== item.id)]
  localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
  status.value = 'Saved in this browser.'
}

function loadText(item: SavedText) {
  title.value = item.title
  language.value = item.language || 'enm'
  sourceUrl.value = item.sourceUrl || ''
  period.value = item.period || ''
  year.value = item.year || ''
  input.value = item.text
  analyze()
  status.value = `Loaded “${item.title}”.`
}

function deleteText(id: string) {
  savedTexts.value = savedTexts.value.filter((entry) => entry.id !== id)
  localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
}

function onFileChange(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    input.value = String(reader.result || '')
    title.value = file.name.replace(/\.[^.]+$/, '')
    status.value = 'Text file loaded.'
  }
  reader.readAsText(file)
  element.value = ''
}

function updateSyllable(lineId: number, partIndex: number, value: string) {
  const line = lines.value.find((entry) => entry.id === lineId)
  const part = line?.parts[partIndex]
  const count = Number(value)
  if (part && Number.isFinite(count)) part.syllables = Math.max(0, Math.min(20, count))
}

function saveJudgmentFor(index: number, otherIndex: number, rhymes: boolean) {
  const a = finalWord(lines.value[index])
  const b = finalWord(lines.value[otherIndex])
  if (a && b) feedback.value = saveJudgment(feedback.value, a, b, rhymes)
}

function addMissingLine() {
  lines.value.push({
    id: Date.now() + Math.random(),
    stanza: lines.value.length ? lines.value[lines.value.length - 1].stanza : 0,
    parts: [{ text: '[missing line]' }],
    gap: true,
    stanzaBreak: false,
  })
}

function colorFor(word: string) {
  return rhymeGroupColors.value.get(rhymeTail(word)) || '#e5e7eb'
}

function exportFeedback() {
  const blob = new Blob([JSON.stringify(feedback.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'verse-rhyme-feedback.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function importFeedback(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as RhymeFeedback[]
      if (!Array.isArray(parsed)) throw new Error('invalid')
      feedback.value = parsed.filter((entry) => typeof entry.a === 'string' && typeof entry.b === 'string' && typeof entry.rhymes === 'boolean')
    } catch {
      window.alert('Please select a valid rhyme-feedback JSON file.')
    }
  }
  reader.readAsText(file)
  element.value = ''
}

function exportHtml() {
  const safeTitle = escapeHtml(title.value || 'Untitled poem')
  const body = lines.value.map((line, index) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const ending = finalWord(line)
    const color = colorFor(ending)
    const escapedText = escapeHtml(lineText(line))
    const escapedEnding = escapeHtml(ending)
    const lineWithoutEnding = ending ? escapedText.slice(0, escapedText.length - ending.length) : escapedText
    return `<p class="line">${lineWithoutEnding}<mark style="background-color:${color}">${escapedEnding}</mark> <span class="count">(${lineTotal(line)})</span><span class="scheme">${rhymeScheme.value[index] || ''}</span></p>`
  }).join('\n')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${safeTitle}</title><style>body{font:22px/1.7 Georgia,serif;max-width:900px;margin:48px auto;padding:0 24px;color:#211f1c}.line{margin:0 0 .25rem;white-space:pre-wrap}mark{color:inherit;padding:0 .12em;border-radius:.12em}.count,.scheme{font:14px system-ui;color:#777;margin-left:.5rem}.missing{color:#8a5b1f}</style><body><h1>${safeTitle}</h1>${body}</body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${(title.value || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase() || 'poem'}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportPdf() { window.print() }

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    if (Array.isArray(stored)) savedTexts.value = stored
  } catch { savedTexts.value = [] }
  try {
    const stored = JSON.parse(localStorage.getItem('verse-rhyme-feedback') || '[]')
    if (Array.isArray(stored)) feedback.value = stored
  } catch { feedback.value = [] }
})

watch(feedback, (value) => localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value)), { deep: true })
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <div class="flex items-center gap-3"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></div>
        <nav class="flex items-center gap-4 text-sm"><button class="font-medium text-[#315d45] underline" @click="newPoem">New poem</button><span class="text-stone-500">Poetry analysis</span></nav>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!analyzed" class="mx-auto max-w-3xl">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1>
        <p class="mt-3 text-stone-600">Paste or upload a poem to see its lines, syllable counts, and rhyme pattern.</p>
        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-medium">Title<input v-model="title" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title"></label>
            <label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languageOptions" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
            <label class="text-sm font-medium sm:col-span-2">Source URL<input v-model="sourceUrl" type="url" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="https://… (optional)"></label>
            <label class="text-sm font-medium">Century / period<input v-model="period" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. 14th century"></label>
            <label class="text-sm font-medium">Year<input v-model="year" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. c. 1380"></label>
          </div>
          <div class="my-4 flex justify-end"><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div>
          <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
          <textarea id="poem-text" v-model="input" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif text-lg leading-8" placeholder="One verse line per row; blank lines separate stanzas."></textarea>
          <div class="mt-5 flex flex-wrap items-end justify-between gap-4"><button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold" @click="saveText">Save text</button><button :disabled="!input.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button></div>
          <p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p>
        </div>
        <section v-if="savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5"><h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2><ul class="mt-3 space-y-2"><li v-for="item in savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2"><button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="loadText(item)">{{ item.title }} <span class="font-normal text-stone-500">· {{ item.language }} · {{ item.period || 'period unspecified' }} {{ item.year }}</span></button><button class="text-xs text-stone-500 hover:text-red-700" @click="deleteText(item.id)">Delete</button></li></ul></section>
      </section>

      <section v-else class="space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="newPoem">← New poem</button><h1 class="text-2xl font-semibold">{{ title || 'Untitled poem' }}</h1><p class="mt-1 text-xs text-stone-500">{{ languageOptions.find((item) => item.value === language)?.label }} · {{ period || 'period unspecified' }} {{ year }} <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener" class="underline">Source</a></p></div>
          <div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="saveText">Save text</button><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button></div>
        </div>

        <section class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <header class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Line syllable totals remain visible. End-word colours are spelling-based suggestions; mark pairs in Pairings to record the poet’s rhyme judgments.</p></header>
          <div class="poem-reader px-5 py-6 sm:px-8 sm:py-8">
            <div v-for="(line, index) in lines" :key="line.id" class="poem-reading-line">
              <div v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Missing line — position preserved</div>
              <template v-else>
                <span v-if="index % 5 === 0" class="line-number">{{ 6925 + index }}</span>
                <span class="poem-words"><template v-for="(part, partIndex) in line.parts" :key="partIndex"><span v-if="part.syllables !== undefined && partIndex === line.parts.length - 1" class="ending-color" :style="{ '--ending-color': colorFor(finalWord(line)) }">{{ part.text }}</span><span v-else>{{ part.text }}</span></template></span>
                <span class="line-total">({{ lineTotal(line) }})</span>
                <button v-if="candidates[index]?.length" type="button" class="pairing-trigger" @click="activePairIndex = activePairIndex === index ? null : index">{{ activePairIndex === index ? 'Close pairings' : 'Pairings' }}</button>
                <div v-if="activePairIndex === index" class="pairing-panel">
                  <p class="mb-2 text-sm font-semibold">Rhyme judgments for “{{ finalWord(line) }}”</p>
                  <p class="mb-3 text-xs text-stone-600">Spelling-tail matches are only suggestions. Your marks are the rhyme evidence.</p>
                  <div v-for="candidate in candidates[index]" :key="candidate.index" class="pairing-row"><span class="font-serif text-lg">{{ candidate.word }}</span><span v-if="candidate.judgment === true" class="text-xs text-green-700">Marked rhyme</span><span v-else-if="candidate.judgment === false" class="text-xs text-amber-700">Marked not rhyme</span><span v-else class="text-xs text-stone-500">Unjudged</span><div class="flex gap-2"><button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800" @click="saveJudgmentFor(index, candidate.index, true)">Rhyme</button><button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700" @click="saveJudgmentFor(index, candidate.index, false)">Not rhyme</button></div></div>
                </div>
              </template>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><div class="flex flex-wrap items-center justify-between gap-3"><div><h2 class="text-lg font-semibold">Rhyme scheme</h2><p class="mt-1 text-sm text-stone-600">Provisional spelling-tail pattern—edit pair judgments above to reflect the poet’s rhymes.</p></div><p class="font-serif text-2xl font-semibold tracking-widest">{{ rhymeScheme || '—' }}</p></div><div class="mt-3 flex flex-wrap gap-2"><span v-for="[group, words] in rhymeGroups" :key="group" class="rounded-full px-3 py-1 text-sm" :style="{ backgroundColor: rhymeGroupColors.get(group) }">{{ words.join(' · ') }}</span></div></section>

        <details class="rounded-2xl border border-stone-200 bg-white p-5"><summary class="cursor-pointer font-semibold">Syllable adjustments</summary><p class="mt-2 text-sm text-stone-600">Edit a word’s syllable count here; these estimates do not determine rhyme.</p><div v-for="line in lines.filter((item) => !item.gap)" :key="line.id" class="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 border-t border-stone-100 pt-3"><span class="font-serif">{{ lineText(line) }}</span><div class="flex flex-wrap gap-2"><label v-for="(part, partIndex) in line.parts.filter((word) => word.syllables !== undefined)" :key="partIndex" class="flex items-center gap-1 text-xs text-stone-600">{{ part.text }}<input class="w-12 rounded border border-stone-300 px-1 py-1 text-center" type="number" min="0" max="20" :value="part.syllables" @input="updateSyllable(line.id, line.parts.indexOf(part), ($event.target as HTMLInputElement).value)"></label></div></div></details>

        <details class="rounded-2xl border border-stone-200 bg-white p-5"><summary class="cursor-pointer font-semibold">Additional analysis</summary><section class="mt-4"><h3 class="font-semibold">Rhyme-pair collection <span class="text-sm font-normal text-stone-500">{{ pairDictionary.length }} pairs</span></h3><div v-if="pairDictionary.length" class="mt-3 overflow-x-auto"><table class="w-full text-left text-sm"><thead><tr class="border-b text-xs uppercase text-stone-500"><th class="p-2">Word 1</th><th class="p-2">Word 2</th><th class="p-2">Frequency</th><th class="p-2">Evidence</th></tr></thead><tbody><tr v-for="pair in pairDictionary" :key="pairKey(pair.a, pair.b)" class="border-b border-stone-100"><td class="p-2 font-serif">{{ pair.a }}</td><td class="p-2 font-serif">{{ pair.b }}</td><td class="p-2">{{ pair.frequency }}</td><td class="p-2">{{ pair.status }}</td></tr></tbody></table></div><p v-else class="mt-2 text-sm text-stone-500">No confirmed rhyme pairs yet.</p></section><section class="mt-5"><h3 class="font-semibold">Vowel and diphthong correspondences</h3><p class="mt-1 text-sm text-stone-600">Based on poet-marked or spelling-tail rhyme pairs.</p><p v-if="!vowelCorrespondences.length" class="mt-2 text-sm text-stone-500">No correspondences recorded.</p><div v-else class="mt-3 space-y-1 text-sm"><p v-for="item in vowelCorrespondences" :key="item.a + item.b">{{ item.a }} / {{ item.b }} — {{ item.count }} instances ({{ item.examples.join('; ') }})</p></div></section><section class="mt-5"><h3 class="font-semibold">Rhyme feedback</h3><p class="mt-1 text-sm text-stone-600">Your judgments are stored in this browser.</p><div class="mt-3 flex gap-2"><button class="rounded border border-stone-300 px-3 py-2 text-sm" @click="exportFeedback">Export examples</button><button class="rounded border border-stone-300 px-3 py-2 text-sm" @click="document.querySelector<HTMLInputElement>('#feedback-file')?.click()">Import examples</button><input id="feedback-file" type="file" accept="application/json,.json" class="hidden" @change="importFeedback"></div></section></details>
        <button class="text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine">+ Add missing line</button>
        <p v-if="status" class="text-sm text-[#315d45]" role="status">{{ status }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.poem-reader { font-family: Georgia, 'Times New Roman', serif; }
.poem-reading-line { position: relative; min-height: 1.65em; margin: 0 0 .22em; padding-left: 2.8rem; font-size: clamp(1.35rem, 2.4vw, 2rem); line-height: 1.6; white-space: pre-wrap; }
.line-number { position: absolute; left: 0; top: .22em; width: 2.2rem; color: #77716a; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .62em; text-align: right; }
.poem-words { white-space: pre-wrap; }
.ending-color { color: #191714; background: var(--ending-color); box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 0 .08em; }
.line-total { margin-left: .55rem; color: #77716a; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .48em; white-space: nowrap; }
.pairing-trigger { margin-left: .5rem; border: 0; background: transparent; color: #315d45; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .48em; text-decoration: underline; cursor: pointer; }
.pairing-panel { margin: .45rem 0 1rem; padding: .8rem 1rem; border-left: 3px solid #315d45; background: #f7f8f6; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 1rem; white-space: normal; }
.pairing-row { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; border-top: 1px solid #e7e5e1; padding: .55rem 0; }
@media print { header, button, details, .pairing-trigger, .line-total { display: none !important; } .poem-reading-line { font-size: 18pt; } }
</style>
