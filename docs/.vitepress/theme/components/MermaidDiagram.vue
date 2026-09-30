<script setup lang="ts">
import { useData } from 'vitepress';
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{ code: string }>();
const { isDark } = useData();
const svg = ref('');

let renders = 0;

async function render() {
  const { default: mermaid } = await import('mermaid');
  // Mermaid sizes boxes by measuring text, so the page font has to be loaded and named literally.
  await document.fonts.ready;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark.value ? 'dark' : 'neutral',
    // The dark theme keeps the light grey shadow, which glows on a dark page.
    themeVariables: isDark.value
      ? { dropShadow: 'drop-shadow(1px 2px 2px rgba(0, 0, 0, 0.5))' }
      : {},
    fontFamily: getComputedStyle(document.body).fontFamily,
  });
  renders += 1;
  const id = `mermaid-${Math.random().toString(36).slice(2)}-${renders}`;
  const { svg: output } = await mermaid.render(id, decodeURIComponent(props.code));
  svg.value = output;
}

onMounted(render);
watch(isDark, render);
</script>

<template>
  <div class="mermaid-diagram" :class="{ loading: !svg }" v-html="svg" />
</template>

<style scoped>
.mermaid-diagram {
  display: flex;
  justify-content: center;
  margin: 16px 0;
  overflow-x: auto;
}

/* Labels are measured outside .vp-doc, so its paragraph spacing must not apply to them. */
.mermaid-diagram :deep(p) {
  margin: 0;
  line-height: inherit;
}

.mermaid-diagram.loading {
  min-height: 120px;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
</style>
