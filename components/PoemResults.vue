<script setup lang="ts">
import { finalWord, lineText, rhymeTail } from '~/composables/usePoetryAnalyzer'

const props = defineProps<any>()
const emit = defineEmits(['new', 'save', 'edit-syllable', 'toggle-rhyme'])

const rhymeGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const line of props.lines) {
    const ending = finalWord(line)
    if (!ending) continue
    const key = rhymeTail(ending)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ending)
  }
  return [...groups.entries()].filter(([, words]) => words.length > 1)
})
</script>

<template>
  <section>
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="emit('new')">← New poem</button>
        <h1 class="text-2xl font-semibold">{{ props.title || 'Untitled poem' }}</h1>
        <p class="mt-1 text-xs text-stone-500">{{ props.language }} · syllable counts are estimates</p>
      </div>
      <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50" @click="emit('save')">Save text</button>
    </div>

    <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div class="border-b border-stone-200 px-5 py-4 sm:px-8">
        <h2 class="font-semibold">Poem</h2>
        <p class="mt-1 text-sm text-stone-500">Adjust the syllable counts directly and inspect likely repeated rhyme endings.</p>
      </div>

      <div class="px-5 py-4 sm:px-8 sm:py-5">
        <div v-for="line in props.lines" :key="line.id" class="py-1">
          <p class="font-serif text-lg leading-8">
            <template v-for="(part, index) in line.parts" :key="index">
              <span v-if="part.syllables === undefined">{{ part.text }}</span>
              <span v-else class="inline-flex items-baseline rounded px-0.5" :class="part.text === finalWord(line) && rhymeGroups.some(([, words]) => words.includes(part.text)) ? 'bg-[#dff1e5]' : ''">
                {{ part.text }}
                <input
                  v-model.number="part.syllables"
                  type="number"
                  min="0"
                  max="20"
                  class="ml-0.5 w-7 border-0 border-b border-dotted border-stone-400 bg-transparent text-center font-sans text-[10px] text-stone-500 focus:outline-none"
                  @input="emit('edit-syllable', { line, part, value: ($event.target as HTMLInputElement).value })"
                >
              </span>
            </template>
            <span class="ml-2 whitespace-nowrap font-sans text-xs text-stone-400">({{ line.parts.reduce((sum, part) => sum + (part.syllables || 0), 0) }})</span>
          </p>
        </div>
      </div>
    </div>

    <section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <h2 class="font-semibold">Rhyme endings</h2>
      <p class="mt-1 text-sm text-stone-600">The groups below are heuristic matches based on the last vowel tail in each final word.</p>
      <ul v-if="rhymeGroups.length" class="mt-3 space-y-2">
        <li v-for="([tail, words]) in rhymeGroups" :key="tail" class="rounded-lg bg-stone-50 px-3 py-2 text-sm">
          <span class="font-medium">{{ words.join(' / ') }}</span>
          <span class="ml-2 text-xs text-stone-500">shared tail: {{ tail }}</span>
        </li>
      </ul>
      <p v-else class="mt-3 text-sm text-stone-500">No repeated rhyme tails were found in this poem.</p>
    </section>

    <p v-if="props.status" class="mt-3 text-sm text-[#315d45]" role="status">{{ props.status }}</p>
  </section>
</template>
