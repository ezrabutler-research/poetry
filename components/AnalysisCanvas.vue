<script setup lang="ts">
import type { SavedText } from '~/composables/usePoetryAnalyzer'

const props = defineProps<{ savedTexts: SavedText[] }>()
const emit = defineEmits<{ (e: 'load', value: SavedText): void; (e: 'delete', value: string): void }>()
</script>

<template>
  <section v-if="props.savedTexts.length" class="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
    <h2 class="font-semibold">Saved texts <span class="text-sm font-normal text-stone-500">(this browser)</span></h2>
    <ul class="mt-3 space-y-2">
      <li v-for="item in props.savedTexts" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
        <button class="text-left text-sm font-medium text-[#315d45] hover:underline" @click="emit('load', item)">
          {{ item.title }}
          <span class="font-normal text-stone-500">· {{ item.language }} · {{ item.period || 'period unspecified' }} {{ item.year }}</span>
        </button>
        <button class="text-xs text-stone-500 hover:text-red-700" @click="emit('delete', item.id)">Delete</button>
      </li>
    </ul>
  </section>
</template>
