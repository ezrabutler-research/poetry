<script setup lang="ts">
import { analyzeText, buildRhymeGroups, finalWord, lineText, languageOptions, rhymeTail } from '~/composables/usePoetryAnalyzer'

const props = defineProps<any>()
const emit = defineEmits(['analyze', 'save', 'load', 'delete', 'upload', 'new'])

const fileInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <section class="mx-auto max-w-3xl">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p>
    <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1>
    <p class="mt-3 max-w-2xl leading-7 text-stone-600">
      Paste a poem, inspect the syllable estimates, and review likely rhyme endings.
    </p>

    <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="text-sm font-medium">
          Title
          <input
            :value="props.title"
            class="mt-1.5 w-full rounded-lg border border-stone-200 px-3 py-2.5"
            placeholder="Poem title"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)"
          >
        </label>

        <label class="text-sm font-medium">
          Language
          <select
            :value="props.language"
            class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5"
            @change="emit('update:language', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="item in languageOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
      </div>

      <div class="my-4 flex justify-end">
        <button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button>
        <input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="emit('upload', $event)">
      </div>

      <label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label>
      <textarea
        id="poem-text"
        :value="props.input"
        rows="12"
        class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7"
        placeholder="One verse line per row; blank lines mark stanzas."
        @input="emit('update:input', ($event.target as HTMLTextAreaElement).value)"
      />

      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-stone-50" @click="emit('save')">
          Save text
        </button>
        <button
          :disabled="!props.input.trim()"
          class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1e3e2e] disabled:cursor-not-allowed disabled:opacity-40"
          @click="emit('analyze')"
        >
          Analyze poem →
        </button>
      </div>

      <p v-if="props.status" class="mt-3 text-sm text-[#315d45]" role="status">{{ props.status }}</p>
    </div>

    <section v-if="props.savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2>
      <ul class="mt-3 space-y-2">
        <li v-for="item in props.savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
          <button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="emit('load', item)">
            {{ item.title }}
            <span class="font-normal text-stone-500">· {{ item.language }}</span>
          </button>
          <button class="text-xs text-stone-500 hover:text-red-700" @click="emit('delete', item.id)">Delete</button>
        </li>
      </ul>
    </section>
  </section>
</template>
