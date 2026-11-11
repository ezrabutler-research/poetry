<script setup lang="ts">
const savedTexts = ref<any[]>([])
const selectedA = ref('')
const selectedB = ref('')

function loadSaved() {
  try {
    const stored = JSON.parse(localStorage.getItem('verse-saved-texts') || '[]')
    savedTexts.value = Array.isArray(stored) ? stored : []
  } catch {
    savedTexts.value = []
  }
}

function finalWords(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*$/u)?.[0] || '')
    .filter(Boolean)
}

const comparison = computed(() => {
  const a = savedTexts.value.find((entry) => entry.id === selectedA.value)
  const b = savedTexts.value.find((entry) => entry.id === selectedB.value)
  if (!a || !b) return null

  const wordsA = new Set(finalWords(a.text))
  const wordsB = new Set(finalWords(b.text))
  const shared = [...wordsA].filter((word) => wordsB.has(word))
  const uniqueA = [...wordsA].filter((word) => !wordsB.has(word))
  const uniqueB = [...wordsB].filter((word) => !wordsA.has(word))

  return {
    a: a.title,
    b: b.title,
    shared,
    uniqueA,
    uniqueB,
  }
})

onMounted(() => loadSaved())
</script>

<template>
  <div class="min-h-screen bg-[#f7f7f4] text-stone-900">
    <header class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-3 no-underline">
          <span class="grid h-9 w-9 place-items-center rounded-lg bg-[#274f3b] text-lg text-white">¶</span>
          <span class="font-semibold">Verse</span>
        </NuxtLink>
        <nav class="flex items-center gap-4 text-sm">
          <NuxtLink to="/" class="font-medium text-[#315d45] underline">Poetry analysis</NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <p class="mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#52715d]">Compare texts</p>
      <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">Rhyme dictionaries</h1>
      <p class="mt-3 max-w-2xl leading-7 text-stone-600">
        Build a comparison across saved poems by noting the final words in each line and checking which endings recur.
      </p>

      <section class="mt-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="text-sm font-medium">
            Text A
            <select v-model="selectedA" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5">
              <option value="">Select a saved poem</option>
              <option v-for="item in savedTexts" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </label>

          <label class="text-sm font-medium">
            Text B
            <select v-model="selectedB" class="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5">
              <option value="">Select a saved poem</option>
              <option v-for="item in savedTexts" :key="item.id" :value="item.id">{{ item.title }}</option>
            </select>
          </label>
        </div>

        <div v-if="comparison" class="mt-6 grid gap-5 md:grid-cols-3">
          <div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <h2 class="font-semibold">Shared endings</h2>
            <ul v-if="comparison.shared.length" class="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
              <li v-for="word in comparison.shared" :key="word">{{ word }}</li>
            </ul>
            <p v-else class="mt-3 text-sm text-stone-500">No shared final-word matches.</p>
          </div>

          <div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <h2 class="font-semibold">Unique to {{ comparison.a }}</h2>
            <ul v-if="comparison.uniqueA.length" class="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
              <li v-for="word in comparison.uniqueA" :key="word">{{ word }}</li>
            </ul>
            <p v-else class="mt-3 text-sm text-stone-500">None.</p>
          </div>

          <div class="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <h2 class="font-semibold">Unique to {{ comparison.b }}</h2>
            <ul v-if="comparison.uniqueB.length" class="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
              <li v-for="word in comparison.uniqueB" :key="word">{{ word }}</li>
            </ul>
            <p v-else class="mt-3 text-sm text-stone-500">None.</p>
          </div>
        </div>

        <p v-else class="mt-5 text-sm text-stone-500">Choose two saved poems to compare their final-word patterns.</p>
      </section>
    </main>
  </div>
</template>
