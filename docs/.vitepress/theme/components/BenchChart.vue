<script setup lang="ts">
// Mean upload times from bench/transfer.bench.ts, OpenSSH on the same machine, Node 22.
const groups = [
  {
    title: '200 files of 4 KiB in 10 directories',
    rows: [
      { name: 'node-scp (SFTP)', ms: 52, ours: true },
      { name: 'node-scp (SCP)', ms: 67, ours: true },
      { name: 'node-ssh', ms: 484 },
      { name: 'ssh2-sftp-client', ms: 534 },
    ],
  },
  {
    title: 'One 16 MiB file',
    rows: [
      { name: 'node-scp (SCP)', ms: 53, ours: true },
      { name: 'node-scp (SFTP)', ms: 57, ours: true },
      { name: 'ssh2-sftp-client', ms: 94 },
      { name: 'node-ssh', ms: 104 },
    ],
  },
];
</script>

<template>
  <div class="bench">
    <div v-for="group in groups" :key="group.title" class="group">
      <div class="title">{{ group.title }} <span>(lower is better)</span></div>
      <div v-for="row in group.rows" :key="row.name" class="row">
        <span class="name">{{ row.name }}</span>
        <div class="track">
          <div
            class="bar"
            :class="{ ours: row.ours }"
            :style="{ width: `${(row.ms / Math.max(...group.rows.map((r) => r.ms))) * 100}%` }"
          />
        </div>
        <span class="ms">{{ row.ms }} ms</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bench {
  display: grid;
  gap: 20px;
  margin: 16px 0;
}

.title {
  margin-bottom: 8px;
  font-weight: 600;
}

.title span {
  font-weight: 400;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.row {
  display: grid;
  grid-template-columns: 140px 1fr 64px;
  gap: 10px;
  align-items: center;
  margin: 6px 0;
  font-size: 13px;
}

.track {
  height: 14px;
  border-radius: 7px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 7px;
  background: var(--vp-c-text-3);
}

.bar.ours {
  background: linear-gradient(90deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
}

.ms {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
