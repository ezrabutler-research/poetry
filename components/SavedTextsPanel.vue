<script setup lang="ts">
import type { SavedText } from '~/composables/usePoetryAnalyzer'
import SavedTextsPanel from '~/components/SavedTextsPanel.vue'

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
  <section class="panel intro-panel">
    <div class="eyebrow">Read closely</div>
    <h1 class="hero-title">Explore the sound of a poem.</h1>
    <p class="intro-copy">Paste a poem to inspect syllable estimates, repeated endings, and the rhyme patterns that shape it.</p>

    <div class="form-card">
      <div class="field-grid">
        <label class="field">
          <span>Title</span>
          <input :value="props.title" placeholder="Poem title" @input="emit('update:title', ($event.target as HTMLInputElement).value)" />
        </label>

        <label class="field">
          <span>Language</span>
          <select :value="props.language" @change="emit('update:language', ($event.target as HTMLSelectElement).value)">
            <option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>

        <label class="field field-full">
          <span>Source URL</span>
          <input :value="props.sourceUrl" type="url" placeholder="https://..." @input="emit('update:source-url', ($event.target as HTMLInputElement).value)" />
        </label>

        <label class="field">
          <span>Century / period</span>
          <input :value="props.period" placeholder="e.g. 14th century" @input="emit('update:period', ($event.target as HTMLInputElement).value)" />
        </label>

        <label class="field">
          <span>Year</span>
          <input :value="props.year" placeholder="e.g. c. 1380" @input="emit('update:year', ($event.target as HTMLInputElement).value)" />
        </label>
      </div>

      <div class="upload-row">
        <button type="button" class="secondary-button" @click="fileInput?.click()">Upload .txt</button>
        <input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="emit('upload', $event)" />
      </div>

      <label class="field field-full">
        <span>Poem text</span>
        <textarea :value="props.input" rows="13" placeholder="One verse line per row; blank lines mark stanzas." @input="emit('update:input', ($event.target as HTMLTextAreaElement).value)"></textarea>
      </label>

      <div class="action-row">
        <button type="button" class="secondary-button" @click="emit('save')">Save text</button>
        <button type="button" class="primary-button" :disabled="!props.input.trim()" @click="emit('analyze')">Analyze poem</button>
      </div>

      <p v-if="props.status" class="status-inline" role="status">{{ props.status }}</p>
    </div>

    <SavedTextsPanel :saved-texts="props.savedTexts" @load="emit('load', $event)" @delete="emit('delete', $event)" />
  </section>
</template>
