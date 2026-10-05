<script setup lang="ts">
import { useLocale } from '../i18n';

const label = useLocale({
  en: 'Files moving from a laptop to a server over SFTP and SCP',
  vi: 'Các tệp được chuyển từ laptop lên máy chủ qua SFTP và SCP',
  zh: '文件通过 SFTP 和 SCP 从笔记本电脑传到服务器',
});
</script>

<template>
  <svg class="hero-art" viewBox="0 0 400 300" role="img" :aria-label="label">
    <!-- laptop -->
    <rect class="card" x="20" y="84" width="140" height="96" rx="12" />
    <rect class="accent" x="38" y="104" width="56" height="8" rx="4" />
    <rect class="muted" x="38" y="120" width="96" height="8" rx="4" />
    <rect class="muted" x="50" y="136" width="72" height="8" rx="4" />
    <rect class="accent soft" x="38" y="152" width="40" height="8" rx="4" />
    <rect class="base" x="6" y="186" width="168" height="10" rx="5" />

    <!-- server -->
    <rect class="card" x="256" y="46" width="124" height="208" rx="14" />
    <g v-for="i in 3" :key="i" :transform="`translate(0 ${(i - 1) * 62})`">
      <rect class="unit" x="270" y="62" width="96" height="48" rx="8" />
      <circle class="led" :class="{ busy: i === 2 }" cx="287" cy="86" r="5" />
      <rect class="muted" x="302" y="80" width="50" height="6" rx="3" />
      <rect class="muted" x="302" y="92" width="32" height="6" rx="3" />
    </g>

    <!-- lanes -->
    <line class="lane" x1="172" y1="118" x2="244" y2="118" />
    <line class="lane" x1="172" y1="160" x2="244" y2="160" />
    <g class="pill">
      <rect x="185" y="86" width="46" height="20" rx="10" />
      <text x="208" y="100">SFTP</text>
    </g>
    <g class="pill scp">
      <rect x="189" y="172" width="38" height="20" rx="10" />
      <text x="208" y="186">SCP</text>
    </g>

    <!-- files in flight: two at once over SFTP, one at a time over SCP -->
    <g class="file sftp-a"><path d="M172 109h10l5 5v13h-15z" /></g>
    <g class="file sftp-b"><path d="M172 109h10l5 5v13h-15z" /></g>
    <g class="file scp-a"><path d="M172 151h10l5 5v13h-15z" /></g>
  </svg>
</template>

<style scoped>
.hero-art {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 300px;
  transform: translate(-50%, -50%);
}

@media (min-width: 640px) {
  .hero-art {
    width: 360px;
  }
}

@media (min-width: 960px) {
  .hero-art {
    width: 400px;
  }
}

.card {
  fill: var(--vp-c-bg);
  stroke: var(--vp-c-brand-1);
  stroke-width: 3;
}

.unit {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-divider);
}

.base {
  fill: var(--vp-c-brand-1);
}

.accent {
  fill: var(--vp-c-brand-1);
}

.accent.soft {
  fill: #06b6d4;
}

.muted {
  fill: var(--vp-c-default-3);
}

.led {
  fill: var(--vp-c-green-1);
}

.led.busy {
  animation: blink 1.2s steps(2, jump-none) infinite;
}

.lane {
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  stroke-dasharray: 4 6;
  opacity: 0.5;
}

.pill rect {
  fill: var(--vp-c-brand-soft);
}

.pill text {
  fill: var(--vp-c-brand-1);
  font: 600 11px var(--vp-font-family-base);
  letter-spacing: 0.04em;
  text-anchor: middle;
}

.pill.scp rect {
  fill: rgba(6, 182, 212, 0.14);
}

.pill.scp text {
  fill: #0891b2;
}

.file path {
  fill: var(--vp-c-brand-1);
}

.file.scp-a path {
  fill: #06b6d4;
}

.file {
  opacity: 0;
  animation: fly 2.4s ease-in-out infinite;
}

.sftp-b {
  animation-delay: 1.2s;
}

.scp-a {
  animation-duration: 3.2s;
}

@keyframes fly {
  0% {
    opacity: 0;
    transform: translateX(0);
  }
  15%,
  80% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(62px);
  }
}

@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .file,
  .led.busy {
    animation: none;
  }

  .file {
    opacity: 1;
    transform: translateX(30px);
  }

  .sftp-b {
    opacity: 0;
  }
}
</style>
