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

const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' }, { value: 'it', label: 'Italian' },
  { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' },
  { value: 'ang', label: 'Anglo-Norman' }
]
const feet = ['Unspecified', 'Iamb', 'Trochee', 'Anapest', 'Dactyl', 'Spondee', 'Pyrrhic']
const rhymeColors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const showTools = ref(false)
const isAnalyzed = computed(() => lines.value.length > 0)

function finalWord(text: string) {
  const withoutTrailingPunctuation = text.trim().replace(/[^\p{L}\p{N}]+$/gu, '')
  return withoutTrailingPunctuation.match(/[\p{L}]+(?:[’'-][\p{L}]+)*$/u)?.[0] ?? ''
}

function rhymeKey(text: string) {
  const word = finalWord(text)
  if (!word) return ''
  let normalized = word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
  const vowels = /[aeiouy]/i
  const hasEarlierVowel = [...normalized.slice(0, -1)].some((char) => vowels.test(char))
  // In these spellings final -e is often silent; retain it in the rhyme ending,
  // but start the rhyme at the preceding vowel (including a written diphthong).
  if (normalized.endsWith('e') && normalized.length > 1 && !vowels.test(normalized.at(-2)!) && hasEarlierVowel) {
    normalized = normalized.slice(0, -1)
    let start = normalized.length - 1
    while (start > 0 && vowels.test(normalized[start - 1])) start--
    normalized = normalized.slice(start) + 'e'
  } else {
    let start = normalized.length - 1
    while (start > 0 && vowels.test(normalized[start - 1]) && vowels.test(normalized[start])) start--
    normalized = normalized.slice(start)
  }
  // Middle English spellings commonly interchange y/i; final y can rhyme with e.
  normalized = normalized.replace(/y/g, 'i').replace(/i$/, 'e')
  // Normalize doubled final vowel spellings such as see/the to the same vowel ending.
  normalized = normalized.replace(/([aeiou])\1+$/g, '$1')
  return normalized
}

const rhymeGroups = computed(() => {
  const hasStanzaBreaks = lines.value.some((line, index) => index > 0 && line.stanzaBreak)
  const groups: (number | null)[] = []
  let nextGroup = 0
  let section = -1
  let sectionKeys = new Map<string, number>()

  lines.value.forEach((line, index) => {
    const nextSection = hasStanzaBreaks
      ? (section < 0 ? 0 : section + (line.stanzaBreak ? 1 : 0))
      : Math.floor(index / 4)
    if (nextSection !== section) {
      section = nextSection
      sectionKeys = new Map<string, number>()
    }
    if (line.gap || !line.text.trim()) {
      groups.push(null)
      return
    }
    const key = rhymeKey(line.text)
    if (!key) {
      groups.push(null)
      return
    }
    if (!sectionKeys.has(key)) sectionKeys.set(key, nextGroup++)
    groups.push(sectionKeys.get(key)!)
  })
  return groups
})
const rhymeCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const group of rhymeGroups.value) {
    if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return counts
})
function rhymeColor(index: number) {
  const group = rhymeGroups.value[index]
  return group !== null && group !== undefined && (rhymeCounts.value.get(group) ?? 0) > 1
    ? rhymeColors[group % rhymeColors.length]
    : 'transparent'
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
    if (!raw.trim()) {
      if (result.length) stanzaBreak = true
      continue
    }
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
  const stress = mark === '·' ? 'Unset' : mark === '˘' ? 'Unstressed' : 'Stressed'
  return `${stress} syllable ${index + 1}`
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
  reader.onload = () => {
    poemInput.value = String(reader.result ?? '')
    if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '')
  }
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
    const color = rhymeColor(index)
    const ending = parts.word
      ? `${escapeHtml(parts.before)}<em style="background:${color}">${escapeHtml(parts.word)}</em>${escapeHtml(parts.after)}`
      : escapeHtml(line.text)
    const marks = line.marks.map((mark) => mark === '·' ? '○' : mark).join(' ')
    const detail = showTools.value ? `<span class="detail">${escapeHtml(line.foot)} · ${escapeHtml(marks)}</span>` : ''
    return `<p class="line">${ending} <span class="count">(${line.syllables})</span>${detail}</p>`
  }).join('\n')
  const title = escapeHtml(poemTitle.value || 'Untitled poem')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px;color:#24231f}.line{margin:0}.line em{font-style:italic;border-radius:3px;padding:1px 3px}.count,.detail{font:14px ui-sans-serif,system-ui;color:#777}.detail{display:block}.missing{color:#986b32;font-style:italic;margin:12px 0}</style><h1>${title}</h1>${body}</html>`
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
        <p class="mt-3 text-stone-600">Paste a poem to see a clean line-by-line syllable count. Matching line endings share a color.</p>
        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div>
          <input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5 outline-none focus:border-[#52715d]" placeholder="Poem title">
          <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
          <textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7 outline-none focus:border-[#52715d]" placeholder="Paste your poem here. Put each verse line on its own line; leave a blank line between stanzas."></textarea>
          <div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1d3d2c] disabled:opacity-40" @click="analyze">Analyze poem →</button></div>
        </div>
        <p class="mt-4 text-xs leading-5 text-stone-500">Counts are estimates, especially for historical forms. You can adjust them after analysis.</p>
      </section>

      <section v-else>
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []">← Back</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div>
          <div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="showTools = !showTools">{{ showTools ? 'Hide tools' : 'Scansion & editing' }}</button><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d3d2c]" @click="exportPdf">Save PDF</button></div>
        </div>
        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Syllable counts appear at line endings. Only matching rhyme pairs in the same stanza or four-line section are highlighted.</p></div>
          <div class="px-5 py-5 sm:px-8 sm:py-7">
            <div v-for="(line, index) in lines" :key="line.id" class="line-row" :class="line.stanzaBreak ? 'stanza-break' : ''">
              <template v-if="line.gap"><p class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line <span class="text-amber-800/70">— position preserved</span></p></template>
              <template v-else>
                <p class="poem-line"><span>{{ endingParts(line.text).before }}</span><em v-if="endingParts(line.text).word" class="rhyme-end" :style="{ backgroundColor: rhymeColor(index) }">{{ endingParts(line.text).word }}</em><span>{{ endingParts(line.text).after }}</span> <span class="syllable-count">({{ line.syllables }})</span></p>
                <div v-if="showTools" class="ml-1 mt-2 border-l-2 border-stone-100 pl-3">
                  <div class="flex flex-wrap items-center gap-3 text-sm text-stone-600"><label class="flex items-center gap-2">Syllables<input :value="line.syllables" type="number" min="0" max="40" class="w-16 rounded border border-stone-200 px-2 py-1 text-center text-stone-900" @input="updateSyllables(line, ($event.target as HTMLInputElement).value)"></label><label class="flex items-center gap-2">Foot<select v-model="line.foot" class="rounded border border-stone-200 bg-white px-2 py-1 text-stone-900"><option v-for="foot in feet" :key="foot">{{ foot }}</option></select></label><button class="text-stone-500 hover:text-red-700" @click="removeLine(index)">Remove line</button><button class="text-stone-500 hover:text-[#315d45]" @click="addMissingLine(index)">Insert missing line after</button></div>
                  <div class="mt-2 flex flex-wrap gap-1" aria-label="Scansion marks"><button v-for="(mark, mi) in line.marks" :key="mi" class="grid h-7 w-7 place-items-center rounded border border-stone-200 text-base hover:border-[#52715d]" :class="mark === '′' ? 'bg-[#e9eee8] text-[#274f3b]' : 'text-stone-500'" :aria-label="markLabel(mark, mi)" @click="cycleMark(line, mi)">{{ mark === '·' ? '○' : mark }}</button><span class="ml-1 self-center text-xs text-stone-400">Click: unset → unstressed → stressed</span></div>
                  <label class="mt-2 block text-sm text-stone-600">Edit line<input v-model="line.text" class="ml-2 w-full max-w-xl rounded border border-stone-200 px-2 py-1 font-serif text-base text-stone-900 sm:w-auto"></label>
                </div>
              </template>
            </div>
            <div class="mt-5 flex flex-wrap items-center gap-4 border-t border-stone-100 pt-4"><button class="text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button></div>
          </div>
        </div>
        <p class="mt-4 text-xs leading-5 text-stone-500">Syllable counts and spelling-based rhyme suggestions are approximate; review historical pronunciations and variant spellings.</p>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line { margin: 0; min-height: 1.85em; font-family: Georgia, 'Times New Roman', serif; font-size: clamp(1.05rem, 2.2vw, 1.3rem); line-height: 1.85; }
.rhyme-end { border-radius: 3px; padding: 0 2px; font-style: italic; }
.syllable-count { white-space: nowrap; color: #77736c; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .82em; }
.stanza-break { margin-top: 1.4rem; }
@media print {
  body { background: white !important; }
  header, button, .text-xs, .line-row > div, main > section > div:first-child > div { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .poem-line { font-size: 13pt; }
  .stanza-break { margin-top: 1.2rem; }
}
</style>
