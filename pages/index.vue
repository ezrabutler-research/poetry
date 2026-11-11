<script setup lang="ts">
import { analyzeText, buildRhymeGroups, finalWord, lineText, languageOptions } from '~/composables/usePoetryAnalyzer'
import PoemEditor from '~/components/PoemEditor.vue'
import AppHeader from '~/components/AppHeader.vue'

const title = ref('')
const language = ref('enm')
const input = ref('')
const lines = ref<any[]>([])
const savedTexts = ref<Array<{ id: string; title: string; text: string; language: string }>>([])
const status = ref('')

const analyzed = computed(() => lines.value.length > 0)

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
  const text = analyzed.value ? lines.value.map((line) => lineText(line)).join('\n') : input.value
  if (!text.trim()) {
    status.value = 'Enter text before saving.'
    return
  }

  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: title.value.trim() || 'Untitled poem',
    text,
    language: language.value,
  }

  savedTexts.value = [item, ...savedTexts.value.filter((saved) => saved.title !== item.title)]
  localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
  status.value = 'Saved in this browser.'
}

function loadText(item: any) {
  title.value = item.title
  language.value = item.language || 'enm'
  input.value = item.text
  analyze()
}

function deleteText(id: string) {
  savedTexts.value = savedTexts.value.filter((item) => item.id !== id)
  localStorage.setItem('verse-saved-texts', JSON.stringify(savedTexts.value))
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
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}

onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    if (Array.isArray(stored)) savedTexts.value = stored
  } catch {
    savedTexts.value = []
  }
})

function updateSyllable({ line, part, value }: { line: any; part: any; value: string }) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return
  part.syllables = Math.max(0, Math.min(20, parsed))
}
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <AppHeader />

    <main class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <PoemEditor
        v-if="!analyzed"
        :title="title"
        :language="language"
        :input="input"
        :status="status"
        :saved-texts="savedTexts"
        :languages="languageOptions"
        @update:title="title = $event"
        @update:language="language = $event"
        @update:input="input = $event"
        @analyze="analyze"
        @save="saveText"
        @load="loadText"
        @delete="deleteText"
        @upload="onFileChange"
      />

      <PoemEditor
        v-else
        :title="title"
        :language="language"
        :input="input"
        :status="status"
        :saved-texts="savedTexts"
        :lines="lines"
        :languages="languageOptions"
        @new="newPoem"
        @save="saveText"
        @delete="deleteText"
        @edit-syllable="updateSyllable"
      />
    </main>
  </div>
</template>
