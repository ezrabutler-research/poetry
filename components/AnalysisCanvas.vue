<script setup lang="ts">
import type { SavedText } from '~/composables/usePoetryAnalyzer'

const props = defineProps<{ savedTexts: SavedText[] }>()
const emit = defineEmits<{ (e: 'load', value: SavedText): void; (e: 'delete', value: string): void }>()
</script>

<template>
  <section v-if="props.savedTexts.length" class="panel saved-panel">
    <div class="panel-header">
      <h2>Saved texts</h2>
      <span>this browser</span>
    </div>

    <ul class="saved-list">
      <li v-for="item in props.savedTexts" :key="item.id" class="saved-item">
        <button type="button" class="saved-link" @click="emit('load', item)">
          <strong>{{ item.title }}</strong>
          <small>{{ item.language }} · {{ item.period || 'period unspecified' }} {{ item.year }}</small>
        </button>
        <button type="button" class="mini-button" @click="emit('delete', item.id)">Delete</button>
      </li>
    </ul>
  </section>
</template>
