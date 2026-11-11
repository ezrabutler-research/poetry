<script setup lang="ts">
type Part = { text: string; syllables?: number }
type PoemLine = { id: number; stanza: number; parts: Part[] }
type SavedText = { id: string; title: string; text: string; language: string }

const languages = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'enm', label: 'Middle English' },
  { value: 'fro', label: 'Old French' },
  { value: 'ang', label: 'Anglo-Norman' },
  { value: 'other', label: 'Other / uncertain' },
]

const title = ref('')
const language = ref('enm')
const input = ref('')
const lines = ref<PoemLine[]>([])
const savedTexts = ref<SavedText[]>([])
const status = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
let nextId = 1

const analyzed = computed(() => lines.value.length > 0)
const rhymeGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const line of lines.value) {
    const ending = finalWord(line)
    if (!ending) continue
    const key = rhymeTail(ending)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ending)
  }
  return [...groups.entries()].filter(([key, words]) => key && words.length > 1)
})

function countSyllables(word: string) {
  const normalized = word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const groups = normalized.match(/[aeiouy]+/g) || []
  let count = groups.length
  if (count > 1 && /e$/.test(normalized) && !/(le|ye)$/.test(normalized)) count--
  if (/[^aeiou]le$/.test(normalized)) count++
  return Math.max(1, count)
}

function tokenize(text: string): Part[] {
  const tokens = text.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) || []
  return tokens.map((part) => /[\p{L}\p{M}]/u.test(part)
    ? { text: part, syllables: countSyllables(part) }
    : { text: part })
}

function lineText(line: PoemLine) {
  return line.parts.map((part) => part.text).join('')
}

function finalWord(line: PoemLine) {
  if (/(?:\.{3,}|…+)\s*$/.test(lineText(line))) return ''
  return [...line.parts].reverse().find((part) => part.syllables !== undefined)?.text || ''
}

function rhymeTail(word: string) {
  const normalized = word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '')
  const tail = normalized.match(/[aeiouy]+[^aeiouy]*$/)?.[0] || ''
  return tail.replace(/([aeiou])\1+$/g, '$1')
}

function analyze() {
  if (!input.value.trim()) {
    status.value = 'Enter a poem before analyzing it.'
    return
  }
  let stanza = 0
  let previousWasBlank = false
  lines.value = input.value.split(/\r?\n/).flatMap((raw) => {
    if (!raw.trim()) {
      if (!previousWasBlank) stanza++
      previousWasBlank = true
      return []
    }
    previousWasBlank = false
    return [{ id: nextId++, stanza, parts: tokenize(raw.trim()) }]
  })
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
  const item: SavedText = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: title.value.trim() || 'Untitled poem',
    text,
    language: language.value,
  }
  savedTexts.value = [item, ...savedTexts.value.filter((saved) => saved.title !== item.title)]
  try {
    localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
    status.value = 'Saved in this browser.'
  } catch {
    status.value = 'Browser storage is unavailable; this text could not be saved.'
  }
}

function loadText(item: SavedText) {
  title.value = item.title
  language.value = item.language || 'enm'
  input.value = item.text
  analyze()
}

function deleteText(id: string) {
  savedTexts.value = savedTexts.value.filter((item) => item.id !== id)
  try {
    localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
  } catch {
    status.value = 'Could not update browser storage.'
  }
}

function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    input.value = String(reader.result || '')
    title.value = file.name.replace(/\.txt$/i, '')
    status.value = 'Text file loaded.'
  }
  reader.onerror = () => { status.value = 'Could not read that file.' }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}

onMounted(() => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    if (Array.isArray(stored)) {
      savedTexts.value = stored.filter((item): item is SavedText =>
        item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.text === 'string')
    }
  } catch {
    savedTexts.value = []
  }
})
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
        <span class="grid h-10 w-10 place-items-center rounded-xl bg-[#274f3b] text-xl text-white" aria-hidden="true">V</span>
        <div><p class="font-semibold">Verse</p><p class="text-xs text-stone-500">Poetry Analysis Studio</p></div>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!analyzed" class="mx-auto max-w-3xl">
        <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
        <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Explore the sound of a poem.</h1>
        <p class="mt-3 max-w-2xl leading-7 text-stone-600">Paste a poem to inspect line syllables and recurring rhyme endings. Blank lines mark stanza breaks. Counts and rhyme matches are estimates, especially for historical languages.</p>

        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-medium">Title
              <input v-model="title" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title">
            </label>
            <label class="text-sm font-medium">Language
              <select v-model="language" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                <option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
          </div>
          <div class="my-4 flex justify-end">
            <button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button>
            <input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange">
          </div>
          <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
          <textarea id="poem-text" v-model="input" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas."></textarea>
          <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-stone-50" @click="saveText">Save text</button>
            <button :disabled="!input.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e3e2e] disabled:cursor-not-allowed disabled:opacity-40" @click="analyze">Analyze poem →</button>
          </div>
          <p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p>
        </div>

        <section v-if="savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2>
          <ul class="mt-3 space-y-2">
            <li v-for="item in savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
              <button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="loadText(item)">{{ item.title }} <span class="font-normal text-stone-500">· {{ languages.find((entry) => entry.value === item.language)?.label || item.language }}</span></button>
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
            <p class="mt-1 text-xs text-stone-500">{{ languages.find((item) => item.value === language)?.label || 'Other' }} · Syllable counts and rhyme matches are estimates.</p>
          </div>
          <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="saveText">Save text</button>
        </div>

        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div class="border-b border-stone-200 px-5 py-4 sm:px-8">
            <h2 class="font-semibold">Poem</h2>
            <p class="mt-1 text-sm text-stone-500">Edit an estimated syllable count directly. Endings sharing a spelling pattern are highlighted.</p>
          </div>
          <div class="px-5 py-4 sm:px-8 sm:py-5">
            <div v-for="line in lines" :key="line.id" class="py-1" :class="line.stanza > 0 && line.id === lines.find((item) => item.stanza === line.stanza)?.id ? 'mt-5 border-t border-stone-100 pt-4' : ''">
              <p class="font-serif text-lg leading-8">
                <template v-for="(part, index) in line.parts" :key="index">
                  <span v-if="part.syllables === undefined">{{ part.text }}</span>
                  <span v-else class="inline-flex items-baseline rounded px-0.5" :class="part.text === finalWord(line) && rhymeGroups.some(([, words]) => words.includes(part.text)) ? 'bg-[#dff1e5]' : ''">
                    {{ part.text }}<input v-model.number="part.syllables" type="number" min="0" max="20" :aria-label="`Syllables in ${part.text}`" class="ml-0.5 w-7 border-0 border-b border-dotted border-stone-400 bg-transparent text-center font-sans text-[10px] text-stone-500 focus:outline-none focus:ring-1 focus:ring-[#52715d]">
                  </span>
                </template>
                <span class="ml-2 whitespace-nowrap font-sans text-xs text-stone-400">({{ line.parts.reduce((sum, part) => sum + (part.syllables || 0), 0) }})</span>
              </p>
            </div>
          </div>
        </div>

        <section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 class="font-semibold">Rhyme endings</h2>
          <p class="mt-1 text-sm text-stone-600">These are spelling-based suggestions, not definitive judgments about pronunciation.</p>
          <ul v-if="rhymeGroups.length" class="mt-3 space-y-2">
            <li v-for="([tail, words]) in rhymeGroups" :key="tail" class="rounded-lg bg-stone-50 px-3 py-2 text-sm"><span class="font-medium">{{ words.join(' / ') }}</span><span class="ml-2 text-xs text-stone-500">shared ending pattern: {{ tail }}</span></li>
          </ul>
          <p v-else class="mt-3 text-sm text-stone-500">No likely repeated spelling patterns found in the line endings.</p>
        </section>
        <p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p>
      </section>
    </main>
  </div>
</template>
