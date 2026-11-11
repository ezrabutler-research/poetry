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

const analyzed = computed(() => lines.value.length > 0)

const rhymeGroups = computed(() => buildRhymeGroups(lines.value))
const pairDictionary = computed(() => buildPairDictionary(lines.value, feedback.value))
const vowelCorrespondences = computed(() => buildVowelCorrespondences(lines.value, feedback.value))
const candidates = computed(() => buildCandidates(lines.value, feedback.value))

function analyze() {
  if (!input.value.trim()) {
    status.value = 'Enter a poem before analyzing it.'
    return
  }

  lines.value = analyzeText(input.value, language.value)
  status.value = ''
}

function newPoem() {
  lines.value = []
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

  savedTexts.value = [item, ...savedTexts.value.filter((saved) => saved.id !== item.id)]
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
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    input.value = String(reader.result || '')
    title.value = file.name.replace(/\.[^.]+$/, '')
    status.value = 'Text file loaded.'
  }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}

function updateSyllable({ line, part, value }: { line: PoemLine; part: { syllables?: number }; value: string }) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return
  part.syllables = Math.max(0, Math.min(20, parsed))
}

function addMissingLine() {
  lines.value.splice(lines.value.length, 0, {
    id: Math.round(Date.now() + Math.random() * 10000),
    stanza: lines.value.length ? lines.value[lines.value.length - 1].stanza : 0,
    parts: [],
    gap: true,
    stanzaBreak: false,
  })
}

function saveJudgmentFor(index: number, otherIndex: number, rhymes: boolean) {
  const a = finalWord(lines.value[index])
  const b = finalWord(lines.value[otherIndex])
  if (!a || !b) return
  feedback.value = saveJudgment(feedback.value, a, b, rhymes)
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
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as RhymeFeedback[]
      if (!Array.isArray(data)) throw new Error('invalid json')
      feedback.value = data.filter((entry) => typeof entry.a === 'string' && typeof entry.b === 'string' && typeof entry.rhymes === 'boolean')
    } catch {
      window.alert('Please select a valid rhyme-feedback JSON file.')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function exportHtml() {
  const titleText = escapeHtml(title.value || 'Untitled poem')
  const body = lines.value.map((line, index) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const word = finalWord(line)
    return `<p class="line">${escapeHtml(lineText(line))} <mark style="background:${line.parts.some(part => part.syllables !== undefined) ? '#dff1e5' : 'transparent'}">${escapeHtml(word)}</mark> <span class="count">(${lineTotal(line)})</span></p>`
  }).join('\n')

  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${titleText}</title><style>body{font:20px/1.65 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px}.line{margin:0 0 .18rem}.count{font:14px system-ui;color:#777}mark{color:inherit;border-radius:4px;padding:0 3px}</style><h1>${titleText}</h1>${body}</html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${(title.value || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').toLowerCase() || 'poem'}.html`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportPdf() {
  window.print()
}

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    if (Array.isArray(stored)) savedTexts.value = stored
  } catch {
    savedTexts.value = []
  }

  try {
    const storedFeedback = JSON.parse(localStorage.getItem('verse-rhyme-feedback') || '[]')
    if (Array.isArray(storedFeedback)) feedback.value = storedFeedback
  } catch {
    feedback.value = []
  }
})

watch(feedback, (value) => {
  localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value))
}, { deep: true })
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-3 no-underline">
          <span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span>
          <span class="font-semibold">Verse</span>
        </NuxtLink>
        <nav class="flex items-center gap-4 text-sm">
          <NuxtLink to="/rhyme-dictionaries" class="font-medium text-[#315d45] underline">Rhyme dictionaries</NuxtLink>
          <span class="text-stone-500">Poetry analysis</span>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!analyzed" class="mx-auto max-w-3xl">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1>
        <p class="mt-3 text-stone-600">Read, compare likely rhymes, and edit syllables only when you need to.</p>

        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-medium">
              Title
              <input v-model="title" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title">
            </label>
            <label class="text-sm font-medium">
              Language
              <select v-model="language" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                <option v-for="item in languageOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label class="text-sm font-medium sm:col-span-2">
              Source URL
              <input v-model="sourceUrl" type="url" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="https://… (optional)">
            </label>
            <label class="text-sm font-medium">
              Century / period
              <input v-model="period" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. 14th century">
            </label>
            <label class="text-sm font-medium">
              Year
              <input v-model="year" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. c. 1380">
            </label>
          </div>

          <div class="my-4 flex justify-end">
            <button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button>
            <input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange">
          </div>

          <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
          <textarea id="poem-text" v-model="input" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas."></textarea>
          <p class="mt-2 text-xs leading-5 text-amber-800">A line ending in … or three or more periods (... / ....) is marked incomplete and excluded from rhyme analysis.</p>

          <div class="mt-5 flex flex-wrap items-end justify-between gap-4">
            <button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold" @click="saveText">Save text</button>
            <button :disabled="!input.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button>
          </div>

          <p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p>
        </div>

        <section v-if="savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2>
          <ul class="mt-3 space-y-2">
            <li v-for="item in savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
              <button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="loadText(item)">
                {{ item.title }}
                <span class="font-normal text-stone-500">· {{ item.language }} · {{ item.period || 'period unspecified' }} {{ item.year }}</span>
              </button>
              <button class="text-xs text-stone-500 hover:text-red-700" @click="deleteText(item.id)">Delete</button>
            </li>
          </ul>
        </section>
      </section>

      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="newPoem">← New poem</button>
            <h1 class="text-2xl font-semibold">{{ title || 'Untitled poem' }}</h1>
            <p class="mt-1 text-xs text-stone-500">
              {{ languageOptions.find((item) => item.value === language)?.label }} · {{ period || 'period unspecified' }} {{ year }}
              <a v-if="sourceUrl" :href="sourceUrl" target="_blank" rel="noopener" class="underline">Source</a>
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="saveText">Save text</button>
            <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button>
            <button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button>
          </div>
        </div>

        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div class="border-b border-stone-200 px-5 py-4 sm:px-8">
            <h2 class="font-semibold">Poem</h2>
            <p class="mt-1 text-sm text-stone-500">Line syllable totals remain visible. Click a word to adjust its own count. Blank lines define stanzas.</p>
          </div>

          <div class="px-5 py-4 sm:px-8 sm:py-5">
            <div v-for="(line, index) in lines" :key="line.id" class="poem-row">
              <p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Missing line — position preserved</p>
              <template v-else>
                <p class="poem-line">
                  <template v-for="(part, partIndex) in line.parts" :key="partIndex">
                    <button v-if="part.syllables !== undefined" class="word-button" :class="partIndex === line.parts.length - 1 ? 'end-word' : ''" :style="partIndex === line.parts.length - 1 ? { backgroundColor: '#dff1e5' } : {}" :title="`Click to edit syllables for ${part.text}`" @click="updateSyllable({ line, part, value: String(part.syllables ?? 0) })">
                      {{ part.text }}
                    </button>
                    <span v-else>{{ part.text }}</span>
                  </template>
                  <span class="line-total">({{ lineTotal(line) }})</span>
                  <button class="rhyme-link" @click="lines[index] && (status = 'Pairing panel opened; use the matched options below.')">Pairings</button>
                </p>

                <div class="inline-panel rhyme-panel">
                  <div class="mb-2 flex items-center justify-between">
                    <p class="text-sm font-semibold">All pairings for {{ finalWord(line) }}</p>
                    <button class="text-xs text-stone-500 underline" @click="status = ''">Close</button>
                  </div>
                  <p class="mb-3 text-xs leading-5 text-stone-500">A spelling estimate is shown for each candidate. Use the controls below to mark a pair as rhyme or not.</p>
                  <div v-if="candidates[index]?.length" class="space-y-2">
                    <div v-for="candidate in candidates[index]" :key="candidate.index" class="rounded-lg border border-stone-200 p-3">
                      <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p class="font-serif text-lg">
                            {{ candidate.word }}
                            <span class="font-sans text-xs text-stone-500">{{ candidate.probability }}% spelling estimate</span>
                            <span v-if="candidate.judgment === true" class="ml-2 font-sans text-xs text-green-700">Marked rhyme</span>
                            <span v-else-if="candidate.judgment === false" class="ml-2 font-sans text-xs text-amber-700">Marked not rhyme</span>
                          </p>
                          <p v-for="reason in candidate.reasons" :key="reason" class="mt-1 text-xs leading-5 text-stone-600">{{ reason }}</p>
                        </div>
                        <div class="flex gap-2">
                          <button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800" @click="saveJudgmentFor(index, candidate.index, true)">Mark rhyme</button>
                          <button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700" @click="saveJudgmentFor(index, candidate.index, false)">Not a rhyme</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p v-else class="text-sm text-stone-500">No other line endings in this stanza.</p>
                </div>
              </template>
            </div>
            <button class="mt-3 text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button>
          </div>
        </div>

        <section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-lg font-semibold">Rhyme-pair collection for this text</h2>
              <p class="mt-1 text-sm text-stone-600">Pairs are grouped by shared rhyme tail and your manual judgments.</p>
            </div>
            <span class="rounded-full bg-stone-100 px-3 py-1 text-sm">{{ pairDictionary.length }} pairs</span>
          </div>

          <div v-if="pairDictionary.length" class="mt-4 overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b text-xs uppercase tracking-wide text-stone-500">
                  <th class="px-2 py-2">Word 1</th>
                  <th class="px-2 py-2">Word 2</th>
                  <th class="px-2 py-2">Frequency</th>
                  <th class="px-2 py-2">Sections</th>
                  <th class="px-2 py-2">Evidence</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pair in pairDictionary" :key="pairKey(pair.a, pair.b)" class="border-b border-stone-100">
                  <td class="px-2 py-2 font-serif text-base">{{ pair.a }}</td>
                  <td class="px-2 py-2 font-serif text-base">{{ pair.b }}</td>
                  <td class="px-2 py-2">{{ pair.frequency }}</td>
                  <td class="px-2 py-2">{{ pair.sections.length ? pair.sections.join(', ') : 'inferred' }}</td>
                  <td class="px-2 py-2 text-xs text-stone-600">{{ pair.status }} · {{ pair.confidence }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="mt-3 text-sm text-stone-500">No rhyme families yet. Use the pairings in the poem and manually mark them as needed.</p>
        </section>

        <section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <h3 class="font-semibold">Vowel and diphthong correspondences</h3>
          <p class="mt-1 text-sm text-stone-600">Heuristic combinations of different word endings after they are identified as rhyming.</p>
          <div v-if="vowelCorrespondences.length" class="mt-3 overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="border-b text-xs uppercase tracking-wide text-stone-500">
                  <th class="px-2 py-2">Spellings that co-rhyme</th>
                  <th class="px-2 py-2">Observed instances</th>
                  <th class="px-2 py-2">Examples</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in vowelCorrespondences" :key="item.a + '|' + item.b" class="border-b border-stone-100">
                  <td class="px-2 py-2 font-semibold">{{ item.a }} / {{ item.b }}</td>
                  <td class="px-2 py-2">{{ item.count }}</td>
                  <td class="px-2 py-2">{{ item.examples.join('; ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="mt-3 text-sm text-stone-500">No corresponding rhythmic groups are present yet.</p>
        </section>

        <details class="mt-4 rounded-xl border border-stone-200 bg-white p-4">
          <summary class="cursor-pointer text-sm font-medium">Rhyme feedback</summary>
          <p class="mt-2 text-xs leading-5 text-stone-500">Your judgments are stored in this browser and reused in your rhyme analysis.</p>
          <div class="mt-3 flex gap-2">
            <button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="exportFeedback">Export examples</button>
            <button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="document.querySelector<HTMLInputElement>('#feedback-file')?.click()">Import examples</button>
            <input id="feedback-file" type="file" accept="application/json,.json" class="hidden" @change="importFeedback">
          </div>
        </details>

        <p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p>
      </section>
    </main>
  </div>
</template>
