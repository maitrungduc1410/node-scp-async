<script setup lang="ts">
import { computed, ref } from 'vue';

interface Server {
  id: string;
  label: string;
  protocol: 'SFTP' | 'SCP';
  fs: boolean;
  parallel: boolean;
  tip: string;
}

const servers: Server[] = [
  {
    id: 'linux',
    label: 'Linux or macOS (OpenSSH)',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    tip: 'The common case. Nothing to configure.',
  },
  {
    id: 'sftp-only',
    label: 'SFTP only hosting',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    tip: "Hosts with ForceCommand internal-sftp refuse to run scp. 'auto' never needs it there.",
  },
  {
    id: 'openwrt',
    label: 'OpenWrt, Dropbear',
    protocol: 'SCP',
    fs: false,
    parallel: false,
    tip: "No SFTP server by default, so 'auto' falls back to SCP. protocol: 'scp' skips the probe. Remote parent directories must exist.",
  },
  {
    id: 'device',
    label: 'Router, switch, appliance',
    protocol: 'SCP',
    fs: false,
    parallel: false,
    tip: 'Often SCP only and slow to log in. Paths such as flash:image.bin are passed through as is.',
  },
  {
    id: 'windows',
    label: 'Windows (OpenSSH)',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    tip: 'Set remoteOs so paths use backslashes and SCP quoting is safe for cmd.exe and PowerShell.',
  },
];

const selected = ref(servers[0]!.id);
const server = computed(() => servers.find((s) => s.id === selected.value)!);
</script>

<template>
  <div class="picker">
    <div class="tabs" role="tablist">
      <button
        v-for="s in servers"
        :key="s.id"
        role="tab"
        :aria-selected="s.id === selected"
        :class="{ on: s.id === selected }"
        @click="selected = s.id"
      >
        {{ s.label }}
      </button>
    </div>
    <div class="facts">
      <div class="fact">
        <span class="label"><code>protocol: 'auto'</code> uses</span>
        <span class="value" :class="server.protocol.toLowerCase()">{{ server.protocol }}</span>
      </div>
      <div class="fact">
        <span class="label"><code>client.fs</code></span>
        <span class="value" :class="server.fs ? 'yes' : 'no'">{{ server.fs ? 'available' : 'undefined' }}</span>
      </div>
      <div class="fact">
        <span class="label">Directory copies</span>
        <span class="value">{{ server.parallel ? 'files in parallel' : 'one file at a time' }}</span>
      </div>
    </div>
    <p class="tip">{{ server.tip }}</p>
    <div class="snippet"><slot :name="server.id" /></div>
  </div>
</template>

<style scoped>
.picker {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tabs button {
  padding: 6px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
  transition: all 0.2s;
}

.tabs button.on {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.fact {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.label {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.value {
  font-size: 18px;
  font-weight: 600;
}

.value.sftp,
.value.yes {
  color: var(--vp-c-green-1);
}

.value.scp {
  color: var(--vp-c-brand-1);
}

.value.no {
  color: var(--vp-c-text-3);
}

.tip {
  margin: 14px 0 8px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}

.snippet :slotted(div[class*='language-']) {
  margin: 0;
  border-radius: 8px;
}
</style>
