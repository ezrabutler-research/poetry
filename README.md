# Verse — Poetry Analysis Studio

A Nuxt 3 + Tailwind starter for exploring syllables, meter, rhyme, and scansion in poetry. Supports English, French, Spanish, Italian, Middle English, Old French, and Anglo-Norman.

## Run locally

```bash
npm install
npm run dev
```

## Features

- Paste a poem or upload a plain-text `.txt` file.
- Estimate syllables per line, with editable counts.
- Select a metrical foot and record scansion by clicking syllable marks (unset → unstressed → stressed).
- Suggest a rhyme scheme and color-code line endings in matching rhyme groups.
- Insert explicit missing-line placeholders without collapsing the order of later lines.
- Download a standalone HTML copy or use the browser print dialog to save a PDF.

## Notes

The included analyzer intentionally uses lightweight, spelling-based heuristics. It does not claim authoritative pronunciation, especially for historical varieties. Rhyme, meter, and syllable counts should be reviewed and can be edited in the interface. PDF export uses the browser's print-to-PDF workflow.
