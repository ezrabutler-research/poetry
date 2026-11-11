<script setup lang="ts">
import { finalWord, lineTotal, pairKey } from '~/composables/usePoetryAnalyzer'
import type { PairRecord, PoemLine, VowelRecord } from '~/composables/usePoetryAnalyzer'

const props = defineProps<{
  title: string
  language: string
  sourceUrl: string
  period: string
  year: string
  lines: PoemLine[]
  status: string
  candidates: Array<Array<{ index: number; word: string; probability: number; reasons: string[]; judgment?: boolean }>>
  pairDictionary: PairRecord[]
  vowelCorrespondences: VowelRecord[]
  feedback: Array<{ a: string; b: string; rhymes: boolean }>
}>()

const emit = defineEmits<{
  (e: 'new-poem'): void
  (e: 'save-text'): void
  (e: 'update-syllable', payload: { lineId: number; partIndex: number; value: string }): void
  (e: 'save-judgment', lineIndex: number, otherIndex: number, rhymes: boolean): void
  (e: 'add-missing-line'): void
  (e: 'export-html'): void
  (e: 'export-pdf'): void
  (e: 'export-feedback'): void
  (e: 'import-feedback', value: Event): void
}>()

const languageOptions = [
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
  <section>
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="emit('new-poem')">← New poem</button>
        <h1 class="text-2xl font-semibold">{{ props.title || 'Untitled poem' }}</h1>
        <p class="mt-1 text-xs text-stone-500">
          {{ languageOptions.find((item) => item.value === props.language)?.label || 'Other' }} · {{ props.period || 'period unspecified' }} {{ props.year }}
          <a v-if="props.sourceUrl" :href="props.sourceUrl" target="_blank" rel="noopener" class="underline">Source</a>
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="emit('save-text')">Save text</button>
        <button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="emit('export-html')">Download HTML</button>
        <button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="emit('export-pdf')">Save PDF</button>
      </div>
    </div>

    <div class="rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div class="border-b border-stone-200 px-5 py-4 sm:px-8">
        <h2 class="font-semibold">Poem</h2>
        <p class="mt-1 text-sm text-stone-500">Line syllable totals remain visible. Edit counts inline and inspect likely rhyme tails.</p>
      </div>

      <div class="px-5 py-4 sm:px-8 sm:py-5">
        <div v-for="(line, index) in props.lines" :key="line.id" class="poem-row">
          <p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Missing line — position preserved</p>
          <template v-else>
            <p class="poem-line">
              <template v-for="(part, partIndex) in line.parts" :key="partIndex">
                <button v-if="part.syllables !== undefined" class="word-button" :class="partIndex === line.parts.length - 1 ? 'end-word' : ''" :title="`Edit syllables for ${part.text}`" @click="emit('update-syllable', { lineId: line.id, partIndex, value: String(part.syllables ?? 0) })">
                  {{ part.text }}
                </button>
                <span v-else>{{ part.text }}</span>
              </template>
              <span class="line-total">({{ lineTotal(line) }})</span>
            </p>

            <div class="inline-panel">
              <label class="text-sm text-stone-700">
                Syllables in final word
                <input :value="line.parts.at(-1)?.syllables ?? 0" type="number" min="0" max="20" class="ml-2 w-16 rounded border border-stone-300 px-2 py-1 text-center" @input="emit('update-syllable', { lineId: line.id, partIndex: Math.max(0, line.parts.length - 1), value: ($event.target as HTMLInputElement).value })">
              </label>
            </div>

            <div class="inline-panel rhyme-panel">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-sm font-semibold">Pairings for {{ finalWord(line) }}</p>
              </div>
              <div v-if="props.candidates[index]?.length" class="space-y-2">
                <div v-for="candidate in props.candidates[index]" :key="candidate.index" class="rounded-lg border border-stone-200 p-3">
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
                      <button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800" @click="emit('save-judgment', index, candidate.index, true)">Mark rhyme</button>
                      <button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700" @click="emit('save-judgment', index, candidate.index, false)">Not a rhyme</button>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-sm text-stone-500">No other line endings in this stanza.</p>
            </div>
          </template>
        </div>

        <button class="mt-3 text-sm font-medium text-[#315d45] hover:underline" @click="emit('add-missing-line')">+ Add missing line</button>
      </div>
    </div>

    <section class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold">Rhyme-pair collection for this text</h2>
          <p class="mt-1 text-sm text-stone-600">Pairs are grouped by shared rhyme tail and your manual judgments.</p>
        </div>
        <span class="rounded-full bg-stone-100 px-3 py-1 text-sm">{{ props.pairDictionary.length }} pairs</span>
      </div>

      <div v-if="props.pairDictionary.length" class="mt-4 overflow-x-auto">
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
            <tr v-for="pair in props.pairDictionary" :key="pairKey(pair.a, pair.b)" class="border-b border-stone-100">
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
      <div v-if="props.vowelCorrespondences.length" class="mt-3 overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b text-xs uppercase tracking-wide text-stone-500">
              <th class="px-2 py-2">Spellings that co-rhyme</th>
              <th class="px-2 py-2">Observed instances</th>
              <th class="px-2 py-2">Examples</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in props.vowelCorrespondences" :key="item.a + '|' + item.b" class="border-b border-stone-100">
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
        <button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="emit('export-feedback')">Export examples</button>
        <button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="document.querySelector<HTMLInputElement>('#feedback-file')?.click()">Import examples</button>
        <input id="feedback-file" type="file" accept="application/json,.json" class="hidden" @change="emit('import-feedback', $event)">
      </div>
    </details>

    <p v-if="props.status" class="mt-3 text-sm text-[#315d45]" role="status">{{ props.status }}</p>
  </section>
</template>
