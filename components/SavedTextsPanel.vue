<script setup lang="ts">
import type { SavedText } from '~/composables/usePoetryAnalyzer'

const props = defineProps<{
  title: string
  language: string
  sourceUrl: string
  period: string
  year: string
  input: string
  savedTexts: SavedText[]
  status: string
}>()

const emit = defineEmits<{
  (e: 'update:title', value: string): void
  (e: 'update:language', value: string): void
  (e: 'update:source-url', value: string): void
  (e: 'update:period', value: string): void
  (e: 'update:year', value: string): void
  (e: 'update:input', value: string): void
  (e: 'analyze'): void
  (e: 'save'): void
  (e: 'load', value: SavedText): void
  (e: 'delete', value: string): void
  (e: 'upload', value: Event): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
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
</script>

<template>
  <section class="mx-auto max-w-3xl">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
    <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1>
    <p class="mt-3 text-stone-600">Read, compare likely rhymes, and edit syllables only when you need to.</p>

    <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-medium">
          Title
          <input :value="props.title" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title" @input="emit('update:title', ($event.target as HTMLInputElement).value)">
        </label>

        <label class="text-sm font-medium">
          Language
          <select :value="props.language" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5" @change="emit('update:language', ($event.target as HTMLSelectElement).value)">
            <option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>

        <label class="text-sm font-medium sm:col-span-2">
          Source URL
          <input :value="props.sourceUrl" type="url" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="https://… (optional)" @input="emit('update:source-url', ($event.target as HTMLInputElement).value)">
        </label>

        <label class="text-sm font-medium">
          Century / period
          <input :value="props.period" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. 14th century" @input="emit('update:period', ($event.target as HTMLInputElement).value)">
        </label>

        <label class="text-sm font-medium">
          Year
          <input :value="props.year" class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="e.g. c. 1380" @input="emit('update:year', ($event.target as HTMLInputElement).value)">
        </label>
      </div>

      <div class="my-4 flex justify-end">
        <button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button>
        <input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="emit('upload', $event)">
      </div>

      <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
      <textarea id="poem-text" :value="props.input" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas." @input="emit('update:input', ($event.target as HTMLTextAreaElement).value)"></textarea>
      <p class="mt-2 text-xs leading-5 text-amber-800">A line ending in … or three or more periods (... / ....) is marked incomplete and excluded from rhyme analysis.</p>

      <div class="mt-5 flex flex-wrap items-end justify-between gap-4">
        <button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold" @click="emit('save')">Save text</button>
        <button :disabled="!props.input.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="emit('analyze')">Analyze poem →</button>
      </div>

      <p v-if="props.status" class="mt-3 text-sm text-[#315d45]" role="status">{{ props.status }}</p>
    </div>

    <SavedTextsPanel :saved-texts="props.savedTexts" @load="emit('load', $event)" @delete="emit('delete', $event)" />
  </section>
</template>
