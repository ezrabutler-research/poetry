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
  <section class="analysis-layout">
    <header class="analysis-header panel">
      <div>
        <button type="button" class="link-button" @click="emit('new-poem')">← New poem</button>
        <h1>{{ props.title || 'Untitled poem' }}</h1>
        <p>
          {{ languageOptions.find((item) => item.value === props.language)?.label || 'Other' }} · {{ props.period || 'period unspecified' }} {{ props.year }}
          <a v-if="props.sourceUrl" :href="props.sourceUrl" target="_blank" rel="noopener" class="source-link">Source</a>
        </p>
      </div>

      <div class="header-actions">
        <button type="button" class="secondary-button" @click="emit('save-text')">Save text</button>
        <button type="button" class="secondary-button" @click="emit('export-html')">Download HTML</button>
        <button type="button" class="primary-button" @click="emit('export-pdf')">Save PDF</button>
      </div>
    </header>

    <section class="panel poem-panel">
      <div class="panel-header">
        <h2>Poem</h2>
      </div>

      <div class="poem-body">
        <div v-for="(line, index) in props.lines" :key="line.id" class="poem-row">
          <p v-if="line.gap" class="missing-line">Missing line — position preserved</p>

          <template v-else>
            <p class="poem-line">
              <template v-for="(part, partIndex) in line.parts" :key="partIndex">
                <button v-if="part.syllables !== undefined" type="button" class="word-button" :class="partIndex === line.parts.length - 1 ? 'end-word' : ''" @click="emit('update-syllable', { lineId: line.id, partIndex, value: String(part.syllables ?? 0) })">
                  {{ part.text }}
                </button>
                <span v-else>{{ part.text }}</span>
              </template>
              <span class="line-total">({{ lineTotal(line) }})</span>
            </p>

            <div class="inline-edit">
              <label>
                Final word syllables
                <input :value="line.parts.at(-1)?.syllables ?? 0" type="number" min="0" max="20" @input="emit('update-syllable', { lineId: line.id, partIndex: Math.max(0, line.parts.length - 1), value: ($event.target as HTMLInputElement).value })" />
              </label>
            </div>

            <div class="pair-panel">
              <div class="panel-subheader">
                <h3>Pairings for {{ finalWord(line) }}</h3>
              </div>

              <div v-if="props.candidates[index]?.length" class="pair-list">
                <div v-for="candidate in props.candidates[index]" :key="candidate.index" class="pair-item">
                  <div class="pair-main">
                    <div>
                      <p class="candidate-word">
                        {{ candidate.word }}
                        <span>{{ candidate.probability }}% spelling estimate</span>
                        <em v-if="candidate.judgment === true">Marked rhyme</em>
                        <em v-else-if="candidate.judgment === false">Marked not rhyme</em>
                      </p>
                      <ul>
                        <li v-for="reason in candidate.reasons" :key="reason">{{ reason }}</li>
                      </ul>
                    </div>

                    <div class="pair-actions">
                      <button type="button" class="small-confirm" @click="emit('save-judgment', index, candidate.index, true)">Mark rhyme</button>
                      <button type="button" class="small-neutral" @click="emit('save-judgment', index, candidate.index, false)">Not a rhyme</button>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="muted-copy">No other line endings in this stanza.</p>
            </div>
          </template>
        </div>

        <button type="button" class="link-button" @click="emit('add-missing-line')">+ Add missing line</button>
      </div>
    </section>

    <section class="panel stats-panel">
      <div class="panel-header">
        <h2>Rhyme-pair collection</h2>
        <span>{{ props.pairDictionary.length }} pairs</span>
      </div>

      <div v-if="props.pairDictionary.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Word 1</th>
              <th>Word 2</th>
              <th>Frequency</th>
              <th>Sections</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pair in props.pairDictionary" :key="pairKey(pair.a, pair.b)">
              <td>{{ pair.a }}</td>
              <td>{{ pair.b }}</td>
              <td>{{ pair.frequency }}</td>
              <td>{{ pair.sections.length ? pair.sections.join(', ') : 'inferred' }}</td>
              <td>{{ pair.status }} · {{ pair.confidence }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted-copy">No rhyme families yet. Use the pairings in the poem and manually mark them as needed.</p>
    </section>

    <section class="panel stats-panel">
      <div class="panel-header">
        <h2>Vowel and diphthong correspondences</h2>
      </div>

      <div v-if="props.vowelCorrespondences.length" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Spellings that co-rhyme</th>
              <th>Observed instances</th>
              <th>Examples</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in props.vowelCorrespondences" :key="item.a + '|' + item.b">
              <td>{{ item.a }} / {{ item.b }}</td>
              <td>{{ item.count }}</td>
              <td>{{ item.examples.join('; ') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted-copy">No corresponding rhythmic groups are present yet.</p>
    </section>

    <details class="panel feedback-panel">
      <summary>Rhyme feedback</summary>
      <p>Your judgments are stored in this browser and reused in your analysis.</p>
      <div class="feedback-actions">
        <button type="button" class="secondary-button" @click="emit('export-feedback')">Export examples</button>
        <button type="button" class="secondary-button" @click="document.querySelector<HTMLInputElement>('#feedback-file')?.click()">Import examples</button>
        <input id="feedback-file" type="file" accept="application/json,.json" class="hidden" @change="emit('import-feedback', $event)">
      </div>
    </details>

    <p v-if="props.status" class="status-inline" role="status">{{ props.status }}</p>
  </section>
</template>
