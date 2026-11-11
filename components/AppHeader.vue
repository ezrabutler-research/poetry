<script setup lang="ts">
import { languageOptions } from '~/composables/usePoetryAnalyzer'

defineProps<any>()
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
          <NuxtLink to="/rhyme-dictionaries" class="font-medium text-[#315d45] underline">Rhyme dictionaries</NuxtLink>
          <span class="text-stone-500">Poetry analysis</span>
        </nav>
      </div>
    </header>
  </div>
</template>
