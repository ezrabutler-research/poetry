<script setup lang="ts">
import AppHeader from '~/components/AppHeader.vue'
import PoemEntryForm from '~/components/PoemEntryForm.vue'
import AnalysisCanvas from '~/components/AnalysisCanvas.vue'
import {
  analyzeText,
  buildCandidates,
  buildPairDictionary,
  buildRhymeGroups,
  buildVowelCorrespondences,
  escapeHtml,
  finalWord,
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

function updateSyllable({ lineId, partIndex, value }: { lineId: number; partIndex: number; value: string }) {
  const line = lines.value.find((entry) => entry.id === lineId)
  if (!line) return

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return

  const lastPart = line.parts[partIndex]
  if (!lastPart) return
  lastPart.syllables = Math.max(0, Math.min(20, parsed))
}

function saveJudgmentFor(index: number, otherIndex: number, rhymes: boolean) {
  const a = finalWord(lines.value[index])
  const b = finalWord(lines.value[otherIndex])
  if (!a || !b) return
  feedback.value = saveJudgment(feedback.value, a, b, rhymes)
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
  const inputElement = event.target as HTMLInputElement
  const file = inputElement.files?.[0]
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
  inputElement.value = ''
}

function exportHtml() {
  const titleText = escapeHtml(title.value || 'Untitled poem')
  const body = lines.value.map((line) => {
    if (line.gap) return '<p class="line missing">[Missing line]</p>'
    const word = finalWord(line)
    return `<p class="line">${escapeHtml(lineText(line))} <mark>${escapeHtml(word)}</mark> <span class="count">(${lineTotal(line)})</span></p>`
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
  <div class="app-shell">
    <AppHeader />

    <main class="page-shell">
      <PoemEntryForm
        v-if="!analyzed"
        :title="title"
        :language="language"
        :source-url="sourceUrl"
        :period="period"
        :year="year"
        :input="input"
        :saved-texts="savedTexts"
        :status="status"
        @update:title="title = $event"
        @update:language="language = $event"
        @update:source-url="sourceUrl = $event"
        @update:period="period = $event"
        @update:year="year = $event"
        @update:input="input = $event"
        @analyze="analyze"
        @save="saveText"
        @load="loadText"
        @delete="deleteText"
        @upload="onFileChange"
      />

      <AnalysisCanvas
        v-else
        :title="title"
        :language="language"
        :source-url="sourceUrl"
        :period="period"
        :year="year"
        :lines="lines"
        :status="status"
        :candidates="candidates"
        :pair-dictionary="pairDictionary"
        :vowel-correspondences="vowelCorrespondences"
        :feedback="feedback"
        @new-poem="newPoem"
        @save-text="saveText"
        @update-syllable="updateSyllable"
        @save-judgment="saveJudgmentFor"
        @add-missing-line="addMissingLine"
        @export-html="exportHtml"
        @export-pdf="exportPdf"
        @export-feedback="exportFeedback"
        @import-feedback="importFeedback"
      />
    </main>
  </div>
</template>
