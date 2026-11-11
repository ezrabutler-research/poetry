export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
    head: {
      title: 'Verse — Poetry Analysis Studio',
      meta: [
        { name: 'description', content: 'Explore syllables, meter, rhyme, and scansion in poetry.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2025-01-01'
})
