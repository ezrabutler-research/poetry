<script setup lang="ts">
type Line = { id: number; text: string; gap: boolean; syllables: number; marks: string[]; foot: string }

const languages = [
  { value: 'en', label: 'English' }, { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' }, { value: 'it', label: 'Italian' },
  { value: 'enm', label: 'Middle English' }, { value: 'fro', label: 'Old French' },
  { value: 'ang', label: 'Anglo-Norman' }
]
const feet = ['Unspecified', 'Iamb', 'Trochee', 'Anapest', 'Dactyl', 'Spondee', 'Pyrrhic']
const language = ref('en')
const poemTitle = ref('')
const poemInput = ref('')
const lines = ref<Line[]>([])
const nextId = ref(1)
const fileInput = ref<HTMLInputElement | null>(null)
const hasAnalyzed = computed(() => lines.value.length > 0)

const rhymeColors = ['#dff1e5', '#fce4d8', '#e5e8fb', '#f8edc8', '#f4dff0', '#d9eff1', '#eee2d5', '#e4e9df']
const rhymeGroups = computed(() => {
  const groups = new Map<string, number>()
  let next = 0
  return lines.value.map((line) => {
    if (line.gap || !line.text.trim()) return null
    const key = rhymeKey(line.text)
    if (!key) return null
    if (!groups.has(key)) groups.set(key, next++)
    return groups.get(key)!
  })
})
const rhymeScheme = computed(() => {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return rhymeGroups.value.map((group) => group === null ? '?' : labels[group % labels.length]).join(' ')
})

function rhymeKey(text: string) {
  const word = text.trim().toLocaleLowerCase().match(/[\p{L}’'-]+$/u)?.[0]?.replace(/[’'-]/g, '') ?? ''
  if (!word) return ''
  // A deliberately conservative spelling-based approximation; pronunciation varies by language and period.
  const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return normalized.slice(-Math.min(3, normalized.length))
}
function countSyllables(text: string, lang: string) {
  const words = text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []
  let total = 0
  for (const word of words) {
    const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const groups = normalized.match(/[aeiouyàâäéèêëïîôöùûü]/gi) ?? []
    let count = 0
    let inVowel = false
    for (const char of normalized) {
      const vowel = /[aeiouyàâäéèêëïîôöùûü]/i.test(char)
      if (vowel && !inVowel) count++
      inVowel = vowel
    }
    if (lang === 'fr' || lang === 'fro' || lang === 'ang') {
      // French final -e is often mute; historical and poetic pronunciation may differ.
      if (count > 1 && /e$/.test(normalized)) count--
    } else if (lang === 'en' || lang === 'enm') {
      // Heuristic only: silent final e and common syllabic endings.
      if (count > 1 && /e$/.test(normalized) && !/(le|ye)$/.test(normalized)) count--
      if (/[^aeiou]le$/.test(normalized)) count++
    }
    total += Math.max(1, count)
  }
  return total
}
function newLine(text: string, gap = false): Line {
  const syllables = gap ? 0 : countSyllables(text, language.value)
  return { id: nextId.value++, text, gap, syllables, marks: Array(syllables).fill('·'), foot: 'Unspecified' }
}
function analyze() {
  lines.value = poemInput.value.split(/\r?\n/).filter((line) => line.trim().length > 0).map((text) => newLine(text.trim()))
}
function updateSyllables(line: Line, value: string | number) {
  line.syllables = Math.max(0, Math.min(40, Number(value) || 0))
  line.marks = Array.from({ length: line.syllables }, (_, i) => line.marks[i] ?? '·')
}
function cycleMark(line: Line, index: number) {
  const cycle = ['·', '˘', '′']
  const current = cycle.indexOf(line.marks[index] ?? '·')
  line.marks[index] = cycle[(current + 1) % cycle.length]
}
function insertGap(index: number) {
  lines.value.splice(index + 1, 0, { id: nextId.value++, text: '', gap: true, syllables: 0, marks: [], foot: 'Unspecified' })
}
function removeLine(index: number) { lines.value.splice(index, 1) }
function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { poemInput.value = String(reader.result ?? ''); if (!poemTitle.value) poemTitle.value = file.name.replace(/\.[^.]+$/, '') }
  reader.readAsText(file)
  ;(event.target as HTMLInputElement).value = ''
}
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!) )
}
function exportHtml() {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const body = lines.value.map((line, i) => {
    if (line.gap) return `<p class="line missing">[Missing line — position preserved]</p>`
    const group = rhymeGroups.value[i]
    const color = group === null ? 'transparent' : rhymeColors[group % rhymeColors.length]
    const markText = line.marks.map((mark) => mark === '·' ? '○' : mark).join(' ')
    return `<p class="line"><span class="scheme">${group === null ? '—' : labels[group % labels.length]}</span><span class="verse" style="background:${color}">${escapeHtml(line.text)}</span><span class="detail">${line.syllables} syllables · ${escapeHtml(line.foot)}${line.foot === 'Unspecified' ? '' : ` · ${Math.floor(line.syllables / Math.max(1, line.foot === 'Iamb' || line.foot === 'Trochee' || line.foot === 'Spondee' || line.foot === 'Pyrrhic' ? 2 : 3))} feet`}</span><span class="marks">${escapeHtml(markText)}</span></p>`
  }).join('\n')
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escapeHtml(poemTitle.value || 'Untitled poem')}</title><style>body{font:16px/1.7 Georgia,serif;max-width:760px;margin:50px auto;color:#24231f}.line{display:flex;align-items:baseline;gap:14px;min-height:42px}.scheme{width:24px;color:#777;font:12px sans-serif}.verse{padding:1px 5px;border-radius:4px}.detail,.marks{color:#777;font:12px sans-serif}.missing{color:#a46b2a;font-style:italic}</style><h1>${escapeHtml(poemTitle.value || 'Untitled poem')}</h1><p>Rhyme scheme: ${escapeHtml(rhymeScheme.value)}</p>${body}</html>`
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName()}.html`)
}
function safeName() { return (poemTitle.value.trim() || 'poem').replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'poem' }
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  URL.revokeObjectURL(url)
}
function exportPdf() { window.print() }
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4]">
    <header class="border-b border-stone-200 bg-white/80">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#top" class="flex items-center gap-3 text-stone-900 no-underline"><span class="grid h-10 w-10 place-items-center rounded-xl bg-[#274f3b] text-xl text-white">¶</span><span><span class="block text-lg font-semibold tracking-tight">Verse</span><span class="block text-xs text-stone-500">Poetry analysis studio</span></span></a>
        <span class="hidden rounded-full border border-stone-200 px-3 py-1.5 text-xs text-stone-500 sm:inline-flex">A workspace for close reading</span>
      </div>
    </header>

    <main id="top" class="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <section class="mb-9 max-w-3xl">
        <p class="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#52715d]">Read the music in a poem</p>
        <h1 class="text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">A little closer to the line.</h1>
        <p class="mt-4 max-w-2xl text-base leading-7 text-stone-600">Explore syllables, meter, rhyme, and scansion. Your text stays in this browser; analyses are suggestions you can revise.</p>
      </section>

      <section v-if="!hasAnalyzed" class="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
        <div class="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
          <div class="mb-5 flex items-center justify-between gap-4"><h2 class="text-lg font-semibold">Start with a poem</h2><button class="text-sm font-medium text-[#315d45] hover:underline" @click="fileInput?.click()">↑ Upload .txt</button><input ref="fileInput" class="hidden" type="file" accept=".txt,text/plain" @change="onFileChange"></div>
          <label class="mb-2 block text-sm font-medium text-stone-700" for="poem-title">Title <span class="font-normal text-stone-400">(optional)</span></label>
          <input id="poem-title" v-model="poemTitle" class="mb-5 w-full rounded-lg border border-stone-200 px-3 py-2.5 outline-none focus:border-[#52715d] focus:ring-2 focus:ring-[#52715d]/15" placeholder="The poem's title" />
          <label class="mb-2 block text-sm font-medium text-stone-700" for="poem-text">Poem text</label>
          <textarea id="poem-text" v-model="poemInput" rows="12" class="w-full resize-y rounded-lg border border-stone-200 px-3 py-3 font-serif leading-7 outline-none focus:border-[#52715d] focus:ring-2 focus:ring-[#52715d]/15" placeholder="Paste your poem here. Keep each verse line on its own line…"></textarea>
          <div class="mt-5 flex flex-wrap items-end justify-between gap-4"><label class="block text-sm font-medium text-stone-700">Language<select v-model="language" class="mt-1.5 block min-w-48 rounded-lg border border-stone-200 bg-white px-3 py-2.5"><option v-for="item in languages" :key="item.value" :value="item.value">{{ item.label }}</option></select></label><button :disabled="!poemInput.trim()" class="rounded-lg bg-[#274f3b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1d3d2c] disabled:cursor-not-allowed disabled:opacity-40" @click="analyze">Analyze poem <span aria-hidden="true">→</span></button></div>
        </div>
        <aside class="rounded-2xl bg-[#e9eee8] p-6 sm:p-7"><p class="text-xs font-semibold uppercase tracking-[.16em] text-[#52715d]">What you can explore</p><div class="mt-5 space-y-5"><div class="flex gap-3"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-semibold text-[#315d45]">01</span><div><h3 class="font-semibold">Syllables &amp; meter</h3><p class="mt-1 text-sm leading-6 text-stone-600">Get a starting count, then choose a foot and adjust the line to match your reading.</p></div></div><div class="flex gap-3"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-semibold text-[#315d45]">02</span><div><h3 class="font-semibold">Rhyme at a glance</h3><p class="mt-1 text-sm leading-6 text-stone-600">See a suggested rhyme scheme and matching end-word highlights.</p></div></div><div class="flex gap-3"><span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-semibold text-[#315d45]">03</span><div><h3 class="font-semibold">Scansion, your way</h3><p class="mt-1 text-sm leading-6 text-stone-600">Click each syllable to cycle through unstressed, stressed, and unset marks.</p></div></div></div><p class="mt-7 border-t border-[#d3ddd2] pt-5 text-xs leading-5 text-stone-500">Historical pronunciation and poetic license can change syllable counts, stress, and rhyme. Treat automated results as a first pass.</p></aside>
      </section>

      <section v-else class="analysis-area">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-4"><div><button class="mb-2 text-sm font-medium text-[#315d45] hover:underline" @click="lines = []">← Edit source poem</button><h2 class="text-2xl font-semibold">{{ poemTitle || 'Untitled poem' }}</h2><p class="mt-1 text-sm text-stone-500">{{ lines.filter(l => !l.gap).length }} lines · {{ languages.find(l => l.value === language)?.label }}</p></div><div class="flex flex-wrap gap-2"><button class="rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-stone-50" @click="exportHtml">Download HTML</button><button class="rounded-lg bg-[#274f3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1d3d2c]" @click="exportPdf">Print / Save PDF</button></div></div>
        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
          <div class="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div class="border-b border-stone-200 px-5 py-4 sm:px-7"><div class="flex flex-wrap items-center justify-between gap-3"><div><h3 class="font-semibold">Line-by-line analysis</h3><p class="mt-1 text-xs text-stone-500">Click a scansion dot to cycle: unset → unstressed → stressed.</p></div><button class="rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 hover:border-[#52715d] hover:text-[#315d45]" @click="insertGap(lines.length - 1)">＋ Add missing line</button></div></div>
            <div class="divide-y divide-stone-100">
              <div v-for="(line, index) in lines" :key="line.id" class="px-5 py-5 sm:px-7" :class="line.gap ? 'bg-amber-50/60' : ''">
                <div v-if="line.gap" class="flex items-center justify-between gap-4"><div><p class="text-sm font-medium text-amber-900">Missing line <span class="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs">position preserved · rhyme unknown</span></p><p class="mt-1 text-xs text-amber-800/75">Later line labels stay in place; add the verse when known.</p></div><div class="flex gap-2"><button class="text-xs font-medium text-[#315d45] hover:underline" @click="line.gap = false">Add text</button><button class="text-xs text-stone-400 hover:text-red-600" @click="removeLine(index)">Remove</button></div></div>
                <div v-else>
                  <div class="flex items-start gap-3"><span class="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold" :style="{ backgroundColor: rhymeGroups[index] === null ? '#f0efeb' : rhymeColors[rhymeGroups[index]! % rhymeColors.length] }">{{ rhymeGroups[index] === null ? '—' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[rhymeGroups[index]! % 26] }}</span><div class="min-w-0 flex-1"><input v-model="line.text" class="w-full border-0 border-b border-transparent bg-transparent px-0 py-0.5 font-serif text-lg leading-7 text-stone-900 outline-none focus:border-stone-300" aria-label="Poem line" /><div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-500"><label class="inline-flex items-center gap-2">Syllables<input :value="line.syllables" type="number" min="0" max="40" class="w-14 rounded border border-stone-200 px-2 py-1 text-center text-stone-800" @input="updateSyllables(line, ($event.target as HTMLInputElement).value)"></label><label class="inline-flex items-center gap-2">Foot<select v-model="line.foot" class="rounded border border-stone-200 bg-white px-2 py-1 text-stone-800"><option v-for="foot in feet" :key="foot">{{ foot }}</option></select></label><span v-if="line.foot !== 'Unspecified'" class="text-stone-500">≈ {{ Math.floor(line.syllables / (['Iamb', 'Trochee', 'Spondee', 'Pyrrhic'].includes(line.foot) ? 2 : 3)) }} {{ ['Iamb', 'Trochee', 'Spondee', 'Pyrrhic'].includes(line.foot) ? 'feet' : 'feet' }}</span><button class="text-stone-400 hover:text-red-600" @click="removeLine(index)">Remove line</button></div><div class="mt-3 flex flex-wrap gap-1.5" :aria-label="`Scansion marks for line ${index + 1}`"><button v-for="(mark, mi) in line.marks" :key="mi" class="grid h-8 w-8 place-items-center rounded-md border text-lg transition hover:border-[#52715d]" :class="mark === '′' ? 'border-[#52715d] bg-[#e9eee8] text-[#274f3b]' : 'border-stone-200 bg-white text-stone-500'" :aria-label="`${mark === '·' ? 'Unset' : mark === '˘' ? 'Unstressed' : 'Stressed'} syllable ${mi + 1}`" @click="cycleMark(line, mi)">{{ mark === '·' ? '○' : mark }}</button><span v-if="!line.marks.length" class="text-xs italic text-stone-400">Set a syllable count to add scansion marks.</span></div></div><button class="rounded px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-700" title="Insert a missing line after this one" @click="insertGap(index)">+ gap</button></div>
                </div>
              </div>
            </div>
          </div>
          <aside class="h-fit rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><p class="text-xs font-semibold uppercase tracking-[.16em] text-[#52715d]">Rhyme map</p><h3 class="mt-2 text-2xl font-semibold tracking-tight">{{ rhymeScheme || '—' }}</h3><p class="mt-2 text-sm leading-6 text-stone-600">Suggested scheme based on line-ending spelling. Identical endings are grouped; sound-alikes and historical rhymes may need your review.</p><div class="mt-5 space-y-2"><div v-for="(group, gi) in [...new Set(rhymeGroups.filter(g => g !== null))]" :key="gi" class="flex items-center gap-2 text-sm"><span class="h-3 w-3 rounded-sm" :style="{ backgroundColor: rhymeColors[group! % rhymeColors.length] }"></span><span class="font-semibold">{{ 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[group! % 26] }}</span><span class="text-stone-500">rhyme group</span></div></div><div class="mt-5 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-500"><strong class="text-stone-700">About this analysis</strong><br>Syllables use simple language-aware heuristics. Meter and rhyme are interpretive; use the editable controls to record your reading.</div></aside>
        </div>
      </section>
    </main>
    <footer class="border-t border-stone-200 px-5 py-6 text-center text-xs text-stone-500">Made for reading closely. Analysis is approximate, especially for historical forms and variant pronunciations.</footer>
  </div>
</template>

<style>
@media print {
  body { background: white !important; }
  header, footer, button, aside, .analysis-area > div:first-child button, .analysis-area > div:first-child .text-sm { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .analysis-area > div:first-child { margin-bottom: 12px !important; }
  .analysis-area > div:first-child h2 { display: block !important; }
  .analysis-area > div:nth-child(2) { display: block !important; }
  .analysis-area > div:nth-child(2) > div { box-shadow: none !important; border: 0 !important; }
  .analysis-area > div:nth-child(2) > div > div { break-inside: avoid; }
  input, select { border: 0 !important; appearance: none; }
  .analysis-area .divide-y { border: 0 !important; }
}
</style>
