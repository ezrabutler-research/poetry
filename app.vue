<script setup lang="ts">
type Part = { text: string; syllables?: number }
type Line = { id: number; parts: Part[]; gap: boolean; stanzaBreak: boolean }
type SavedText = { id: string; title: string; text: string; language: string; updatedAt: number }
type RhymeFeedback = { a: string; b: string; rhymes: boolean }
type Candidate = { index: number; word: string; probability: number; reasons: string[]; accepted: boolean }
const languages = [{ value: 'en', label: 'English' }, { value: 'fr', label: 'French' }, { value: 'es', label: 'Spanish' }, { value: 'it', label: 'Italian' }, { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' }, { value: 'ang', label: 'Anglo-Norman' }]
const colors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const language = ref('enm')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const activeRhymeId = ref<number | null>(null)
const editingWord = ref<{ lineId: number; partIndex: number } | null>(null)
const feedbackFile = ref<HTMLInputElement | null>(null)
const feedback = ref<RhymeFeedback[]>([])
const savedTexts = ref<SavedText[]>([])
const selectedSavedId = ref('')
const status = ref('')
const storageReady = ref(false)
const hasPoem = computed(() => lines.value.length > 0)

function normalize(word: string) { return word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'-]/g, '') }
function tokenize(text: string): Part[] {
  const tokens = text.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu) ?? []
  return tokens.map((token) => /[\p{L}\p{M}]/u.test(token) ? { text: token, syllables: countWordSyllables(token, language.value) } : { text: token })
}
function wordParts(line: Line) { return line.parts.map((part, partIndex) => ({ part, partIndex })).filter(({ part }) => part.syllables !== undefined) }
function lineTotal(line: Line) { return wordParts(line).reduce((sum, { part }) => sum + (part.syllables ?? 0), 0) }
function finalWord(line: Line) { return wordParts(line).at(-1)?.part.text ?? '' }
function pairKey(a: string, b: string) { return [normalize(a), normalize(b)].sort().join('|') }
function tail(word: string) {
  let value = normalize(word).replace(/y$/, 'e')
  if (!value) return ''
  const accentedFinal = /[éèê]$/i.test(word)
  if (!accentedFinal && value.length > 2 && value.endsWith('e') && !/[aeiouy]e$/.test(value) && /[aeiou]/.test(value.slice(0, -1))) value = value.slice(0, -1)
  return (value.match(/[aeiou]+[^aeiou]*$/i)?.[0] ?? value).replace(/([aeiou])\1+$/g, '$1')
}
function exactFeedback(a: string, b: string) { return feedback.value.find((item) => pairKey(item.a, item.b) === pairKey(a, b)) }
function learned(a: string, b: string) {
  const aTail = tail(a); const bTail = tail(b)
  return !!aTail && aTail === bTail && feedback.value.some((item) => item.rhymes && tail(item.a) === aTail && tail(item.b) === bTail)
}
function rhymeReasons(a: string, b: string) {
  const x = normalize(a); const y = normalize(b); const reasons: string[] = []
  if (/[éèê]$/i.test(a) || /[éèê]$/i.test(b)) reasons.push('Treats final accented é/è/ê as pronounced, adding a syllable.')
  if (x.endsWith('e') !== y.endsWith('e')) reasons.push('Assumes written final -e is silent in one word.')
  if ((x.endsWith('y') && y.endsWith('e')) || (y.endsWith('y') && x.endsWith('e'))) reasons.push('Assumes final -y can share the vowel sound of -e.')
  if (x.replace(/y/g, 'i') === y.replace(/y/g, 'i')) reasons.push('Allows historical y/i spelling variation.')
  if (!reasons.length) reasons.push(`The endings share the spelling-based rhyme tail “${tail(a)}”; historical pronunciation is uncertain.`)
  return reasons
}
function countWordSyllables(word: string, lang: string) {
  const accentedFinal = /[éèê]$/i.test(word)
  const normalized = word.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let count = 0; let inVowel = false
  for (const char of normalized) { const vowel = /[aeiouy]/i.test(char); if (vowel && !inVowel) count++; inVowel = vowel }
  if (['fr', 'fro', 'ang'].includes(lang)) { if (count > 1 && /e$/.test(normalized) && !accentedFinal) count-- }
  else if (['en', 'enm'].includes(lang)) {
    if (count > 1 && /e$/.test(normalized) && !accentedFinal && !/(le|ye)$/.test(normalized)) count--
    if (/[^aeiou]le$/.test(normalized)) count++
  }
  return Math.max(1, count)
}
function analyze() {
  let breakNext = false; const result: Line[] = []
  for (const raw of poemInput.value.split(/\r?\n/)) {
    if (!raw.trim()) { if (result.length) breakNext = true; continue }
    result.push({ id: nextId.value++, parts: tokenize(raw.trim()), gap: false, stanzaBreak: breakNext }); breakNext = false
  }
  lines.value = result; activeRhymeId.value = null; editingWord.value = null
}
function editSyllables(part: Part, value: string) { part.syllables = Math.max(0, Math.min(20, Number(value) || 0)) }
function sectionIds() {
  const stanzaMode = lines.value.some((line, i) => i > 0 && line.stanzaBreak)
  return lines.value.map((_, i) => stanzaMode ? lines.value.slice(0, i + 1).filter((line, j) => j > 0 && line.stanzaBreak).length : Math.floor(i / 4))
}
const sections = computed(sectionIds)
function indicesInSection(id: number) { return lines.value.map((_, i) => i).filter((i) => sections.value[i] === id && !lines.value[i].gap) }
function estimate(a: string, b: string, aIndex: number, bIndex: number) {
  const judgment = exactFeedback(a, b); let probability = tail(a) && tail(a) === tail(b) ? 82 : 18
  let reasons = rhymeReasons(a, b)
  if (learned(a, b)) { probability = Math.max(probability, 94); reasons = [...reasons, 'This matches a rhyme-tail pattern from a pair you accepted previously.'] }
  const sectionIndices = indicesInSection(sections.value[aIndex]); const pa = sectionIndices.indexOf(aIndex); const pb = sectionIndices.indexOf(bIndex)
  const scheme = likelyScheme.value
  if (scheme && pa >= 0 && pb >= 0 && pa !== pb && scheme.pattern[pa] === scheme.pattern[pb]) {
    probability = Math.max(probability, Math.min(78, 55 + Math.round(scheme.confidence * .23)))
    reasons = [...reasons, `These positions fit the repeated ${scheme.pattern} stanza pattern.`]
  }
  if (judgment?.rhymes) { probability = 100; reasons = [...reasons, 'You accepted this pair; the judgment is saved in this browser.'] }
  if (judgment?.rhymes === false) { probability = 0; reasons = [...reasons, 'You marked this pair not a rhyme.'] }
  return { probability, reasons, accepted: judgment?.rhymes === true }
}
const candidates = computed(() => lines.value.map((line, i) => {
  const word = finalWord(line)
  if (!word || line.gap) return []
  return indicesInSection(sections.value[i]).filter((j) => j !== i).map((j) => ({ index: j, word: finalWord(lines.value[j]), ...estimate(word, finalWord(lines.value[j]), i, j) })).filter((item) => item.probability > 50).sort((a, b) => b.probability - a.probability)
}))
const rhymeGroups = computed(() => {
  const roots = lines.value.map((_, i) => i)
  const find = (x: number): number => roots[x] === x ? x : (roots[x] = find(roots[x]))
  for (let i = 0; i < lines.value.length; i++) for (let j = i + 1; j < lines.value.length; j++) {
    if (!lines.value[i].gap && !lines.value[j].gap && sections.value[i] === sections.value[j] && estimate(finalWord(lines.value[i]), finalWord(lines.value[j]), i, j).probability > 50) roots[find(i)] = find(j)
  }
  const ids = new Map<number, number>()
  return lines.value.map((line, i) => { if (line.gap || !finalWord(line)) return null; const root = find(i); if (!ids.has(root)) ids.set(root, ids.size); return ids.get(root)! })
})
const patterns = computed(() => [...new Set(sections.value)].map((id) => {
  const indices = indicesInSection(id); const labels = new Map<number, string>()
  const pattern = indices.map((i) => { const group = rhymeGroups.value[i]; if (group === null) return '?'; if (!labels.has(group)) labels.set(group, String.fromCharCode(65 + labels.size % 26)); return labels.get(group)! }).join('')
  return pattern
}))
const likelyScheme = computed(() => {
  const usable = patterns.value.filter((pattern) => pattern.length > 1 && !pattern.includes('?'))
  if (!usable.length) return null
  const counts = new Map<string, number>(); usable.forEach((pattern) => counts.set(pattern, (counts.get(pattern) ?? 0) + 1))
  const [pattern, count] = [...counts].sort((a, b) => b[1] - a[1])[0]
  return { pattern, confidence: Math.round(count / usable.length * 100), sections: usable.length }
})
const groupCounts = computed(() => { const counts = new Map<number, number>(); rhymeGroups.value.forEach((group) => { if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1) }); return counts })
function rhymeColor(i: number) { const group = rhymeGroups.value[i]; return group !== null && group !== undefined && (groupCounts.value.get(group) ?? 0) > 1 ? colors[group % colors.length] : 'transparent' }
function saveJudgment(i: number, j: number, rhymes: boolean) {
  const a = finalWord(lines.value[i]); const b = finalWord(lines.value[j]); if (!a || !b) return
  const key = pairKey(a, b); feedback.value = [...feedback.value.filter((item) => pairKey(item.a, item.b) !== key), { a, b, rhymes }]
}
function lineText(line: Line) { return line.parts.map((part) => part.text).join('') }
function saveText() {
  const text = hasPoem.value ? lines.value.map(lineText).join('\n') : poemInput.value
  if (!text.trim()) { status.value = 'Enter text before saving.'; return }
  const old = savedTexts.value.find((item) => item.id === selectedSavedId.value)
  const item: SavedText = { id: old?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: poemTitle.value.trim() || 'Untitled poem', text, language: language.value, updatedAt: Date.now() }
  savedTexts.value = [item, ...savedTexts.value.filter((saved) => saved.id !== item.id)]; selectedSavedId.value = item.id; status.value = 'Saved in this browser.'
}
function loadText(item: SavedText) { poemTitle.value = item.title; poemInput.value = item.text; language.value = item.language; selectedSavedId.value = item.id; analyze(); status.value = `Loaded “${item.title}”.` }
function deleteText(id: string) { savedTexts.value = savedTexts.value.filter((item) => item.id !== id); if (selectedSavedId.value === id) selectedSavedId.value = '' }
onMounted(() => {
  try { feedback.value = JSON.parse(localStorage.getItem('verse-rhyme-feedback') || JSON.stringify(starterPairs.map(([a, b]) => ({ a, b, rhymes: true })))); savedTexts.value = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]') }
  catch { feedback.value = starterPairs.map(([a, b]) => ({ a, b, rhymes: true })); savedTexts.value = [] }
  storageReady.value = true
})
watch(feedback, (value) => { if (storageReady.value) { try { localStorage.setItem('verse-rhyme-feedback', JSON.stringify(value)) } catch { /* local storage can be unavailable in private mode */ } } }, { deep: true })
watch(savedTexts, (value) => { if (storageReady.value) { try { localStorage.setItem('verse-saved-texts', JSON.stringify(value)) } catch { status.value = 'Browser storage is unavailable; this text was not saved.' } } }, { deep: true })
function onFileChange(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }; reader.readAsText(file); input.value = '' }
function importFeedback(event: Event) { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)) as RhymeFeedback[]; if (!Array.isArray(data) || data.some((x) => typeof x.a !== 'string' || typeof x.b !== 'string' || typeof x.rhymes !== 'boolean')) throw new Error(); feedback.value = [...feedback.value.filter((x) => !data.some((y) => pairKey(x.a, x.b) === pairKey(y.a, y.b))), ...data] } catch { window.alert('Please select a valid rhyme-feedback JSON file.') } }; reader.readAsText(file); input.value = '' }
function exportFeedback() { download(new Blob([JSON.stringify(feedback.value, null, 2)], { type: 'application/json' }), 'verse-rhyme-feedback.json') }
function endingParts(line: Line) { return wordParts(line).at(-1)?.part }
function escapeHtml(text: string) { return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function exportHtml() { const title = escapeHtml(poemTitle.value || 'Untitled poem'); const body = lines.value.map((line) => line.gap ? '<p class="line missing">[Missing line]</p>' : `<p class="line">${escapeHtml(lineText(line))} <span>(${lineTotal(line)})</span></p>`).join('\n'); download(new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><style>body{font:20px/1.9 Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px}.line{margin:0}.line span{font:14px system-ui;color:#777}.missing{color:#986b32;font-style:italic}</style><h1>${title}</h1>${body}</html>`], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`) }
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white"><div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8"><a href="#top" class="flex items-center gap-3 no-underline"><span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span><span class="font-semibold">Verse</span></a><span class="text-sm text-stone-500">Poetry analysis</span></div></header>
    <main id="top" class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <section v-if="!hasPoem" class="mx-auto max-w-3xl"><p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Read closely</p><h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">See the shape of a poem.</h1><p class="mt-3 text-stone-600">Read, compare likely rhymes, and edit syllables only when you need to.</p>
        <div class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7"><div class="mb-4 flex items-center justify-between"><label for="poem-title" class="text-sm font-medium">Title <span class="font-normal text-stone-400">(optional)</span></label><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div><input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5" placeholder="Poem title"><label for="poem-text" class="mb-2 block text-sm font-medium">Poem text</label><textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7" placeholder="One verse line per row; blank lines mark stanzas."></textarea><div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="text-sm font-medium">Language<select v-model="language" class="mt-1.5 block rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><div class="flex gap-2"><button class="rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm font-semibold" @click="saveText">Save text</button><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40" @click="analyze">Analyze poem →</button></div></div><p v-if="status" class="mt-3 text-sm text-[#315d45]" role="status">{{ status }}</p></div>
        <section v-if="savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5"><h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2><ul class="mt-3 space-y-2"><li v-for="item in savedTexts" :key="item.id" class="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2"><button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="loadText(item)">{{ item.title }} <span class="font-normal text-stone-500">· {{ new Date(item.updatedAt).toLocaleDateString() }}</span></button><button class="text-xs text-stone-500 hover:text-red-700" @click="deleteText(item.id)">Delete</button></li></ul></section>
        <p class="mt-4 text-xs leading-5 text-stone-500">Click a word in the analyzed poem to see and adjust its syllable count. Final accented é is counted as a pronounced syllable.</p></section>
      <section v-else><div class="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button class="mb-1 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []; poemInput = ''">← New poem</button><h1 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h1></div><div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="saveText">Save text</button><button class="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-3 py-2 text-sm font-semibold text-white" @click="exportPdf">Save PDF</button></div></div>
        <div class="rounded-2xl border border-stone-200 bg-white shadow-sm"><div class="border-b border-stone-200 px-5 py-4 sm:px-8"><h2 class="font-semibold">Poem</h2><p class="mt-1 text-sm text-stone-500">Click any word to adjust its syllables. Use “Rhymes” at the line end to inspect likely pairings.</p><p v-if="likelyScheme" class="mt-2 text-sm text-[#315d45]">Likely rhyme scheme <strong>{{ likelyScheme.pattern }}</strong><span class="text-stone-500"> · {{ likelyScheme.confidence }}% of {{ likelyScheme.sections }} stanza/section patterns</span></p><p v-if="status" class="mt-2 text-sm text-[#315d45]" role="status">{{ status }}</p></div>
          <div class="px-5 py-5 sm:px-8 sm:py-7"><div v-for="(line, index) in lines" :key="line.id" class="poem-row" :class="line.stanzaBreak ? 'stanza-break' : ''"><p v-if="line.gap" class="my-2 rounded-lg bg-amber-50 px-3 py-2 text-sm italic text-amber-900">Missing line — position preserved</p><template v-else><p class="poem-line"><template v-for="(part, partIndex) in line.parts" :key="partIndex"><button v-if="part.syllables !== undefined" class="word-button" :class="partIndex === wordParts(line).at(-1)?.partIndex ? 'end-word' : ''" :style="partIndex === wordParts(line).at(-1)?.partIndex ? { backgroundColor: rhymeColor(index) } : {}" :aria-expanded="editingWord?.lineId === line.id && editingWord.partIndex === partIndex" :title="`Click to edit syllables for ${part.text}`" @click="editingWord = editingWord?.lineId === line.id && editingWord.partIndex === partIndex ? null : { lineId: line.id, partIndex }">{{ part.text }}</button><span v-else>{{ part.text }}</span></template><button class="rhyme-link" :aria-expanded="activeRhymeId === line.id" @click="activeRhymeId = activeRhymeId === line.id ? null : line.id">Rhymes</button></p>
            <div v-if="editingWord?.lineId === line.id" class="inline-panel"><label class="text-sm text-stone-700">Syllables in “{{ line.parts[editingWord.partIndex].text }}” <input :value="line.parts[editingWord.partIndex].syllables" type="number" min="0" max="20" class="ml-2 w-16 rounded border border-stone-300 px-2 py-1 text-center" @input="editSyllables(line.parts[editingWord.partIndex], ($event.target as HTMLInputElement).value)"></label><button class="ml-2 text-sm text-stone-500 underline" @click="editingWord = null">Done</button><p v-if="/[éèê]$/i.test(line.parts[editingWord.partIndex].text)" class="mt-1 text-xs text-stone-500">The accented final vowel is treated as pronounced and counted as a syllable.</p><p class="mt-1 text-xs text-stone-500">Line total: {{ lineTotal(line) }} syllables</p></div>
            <div v-if="activeRhymeId === line.id" class="inline-panel rhyme-panel"><div class="mb-2 flex items-center justify-between"><p class="text-sm font-semibold">Possible rhymes for {{ finalWord(line) }}</p><button class="text-xs text-stone-500 underline" @click="activeRhymeId = null">Close</button></div><p class="mb-3 text-xs leading-5 text-stone-500">Only suggestions above 50% are shown. Reasons stay visible after your judgment; estimates are heuristic, not measured historical probabilities.</p><div v-if="candidates[index]?.length" class="space-y-2"><div v-for="candidate in candidates[index]" :key="candidate.index" class="rounded-lg border border-stone-200 p-3"><div class="flex flex-wrap items-start justify-between gap-3"><div><p class="font-serif text-lg">{{ candidate.word }} <span class="font-sans text-xs text-stone-500">{{ candidate.probability }}% likely</span><span v-if="candidate.accepted" class="ml-2 font-sans text-xs text-green-700">Accepted</span></p><p v-for="reason in candidate.reasons" :key="reason" class="mt-1 text-xs leading-5 text-stone-600">{{ reason }}</p></div><div class="flex gap-2"><button class="rounded bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-800" @click="saveJudgment(index, candidate.index, true)">{{ candidate.accepted ? 'Likely rhyme ✓' : 'Likely rhyme' }}</button><button class="rounded bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700" @click="saveJudgment(index, candidate.index, false)">Not a rhyme</button></div></div></div></div><p v-else class="text-sm text-stone-500">No other line endings in this stanza/section are above 50% likelihood.</p></div></template></div><button class="mt-5 text-sm font-medium text-[#315d45] hover:underline" @click="addMissingLine()">+ Add missing line</button></div></div>
        <details class="mt-4 rounded-xl border border-stone-200 bg-white p-4"><summary class="cursor-pointer text-sm font-medium">Rhyme feedback</summary><p class="mt-2 text-xs leading-5 text-stone-500">Accepted patterns and exact judgments are saved in this browser. They do not train a shared model.</p><div class="mt-3 flex gap-2"><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="exportFeedback">Export examples</button><button class="rounded border border-stone-300 px-2.5 py-1.5 text-xs" @click="feedbackFile?.click()">Import examples</button><input ref="feedbackFile" type="file" accept="application/json,.json" class="hidden" @change="importFeedback"></div></details>
      </section>
    </main>
  </div>
</template>

<style>
.poem-line{margin:0;min-height:1.9em;font-family:Georgia,'Times New Roman',serif;font-size:clamp(1.1rem,2.4vw,1.35rem);line-height:1.9}.word-button{border:0;background:transparent;padding:0 1px;color:inherit;font:inherit;font-style:normal;cursor:pointer}.word-button:hover,.word-button:focus-visible{border-radius:3px;outline:2px solid #9aaa9d;outline-offset:1px}.end-word{border-radius:4px;padding:0 3px}.rhyme-link{margin-left:.5rem;border:0;background:transparent;color:#52715d;font: .72rem ui-sans-serif,system-ui,sans-serif;text-decoration:underline;cursor:pointer}.stanza-break{margin-top:1.5rem}.inline-panel{margin:.5rem 0 1rem .25rem;border-left:2px solid #d6e0d6;padding:.25rem 0 .25rem .8rem}.rhyme-panel{max-width:760px;border-radius:.5rem;background:#fbfcfa;padding:.8rem}
@media print{body{background:white!important}header,button,details,.inline-panel{display:none!important}main{max-width:none!important;padding:0!important}.poem-line{font-size:13pt}.stanza-break{margin-top:1.2rem}}
</style>
