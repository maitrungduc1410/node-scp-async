<script setup lang="ts">
import { computed, ref } from 'vue';

type State = 'new' | 'replaced' | 'kept';
interface Row {
  depth: number;
  name: string;
  dir?: boolean;
  state?: State;
}

const props = withDefaults(defineProps<{ initial?: 'library' | 'cli' }>(), { initial: 'library' });

const tool = ref(props.initial);
const exists = ref(false);
const slash = ref(false);

const local: Row[] = [
  { depth: 0, name: 'dist', dir: true },
  { depth: 1, name: 'index.html' },
  { depth: 1, name: 'assets', dir: true },
  { depth: 2, name: 'app.js' },
];

const before = computed<Row[]>(() => [
  { depth: 0, name: '/var/www', dir: true },
  ...(exists.value
    ? [
        { depth: 1, name: 'app', dir: true },
        { depth: 2, name: 'index.html' },
        { depth: 2, name: 'old.html' },
      ]
    : []),
]);

const command = computed(() =>
  tool.value === 'library'
    ? "await client.upload('dist', '/var/www/app', { recursive: true });"
    : `npx node-scp -r dist deploy@host:/var/www/app${slash.value ? '/' : ''}`,
);

const intoDir = computed(() => tool.value === 'cli' && (slash.value || exists.value));

const outcome = computed<{ rows?: Row[]; error?: string; note: string }>(() => {
  const copied = (depth: number, replace: boolean): Row[] => [
    { depth, name: 'index.html', state: replace ? 'replaced' : 'new' },
    { depth, name: 'assets', dir: true, state: 'new' },
    { depth: depth + 1, name: 'app.js', state: 'new' },
  ];
  if (intoDir.value && !exists.value) {
    return {
      error: 'Fails: /var/www/app does not exist.',
      note: 'A trailing slash means "into this directory", so the directory has to exist already.',
    };
  }
  if (intoDir.value) {
    return {
      rows: [
        { depth: 0, name: '/var/www', dir: true },
        { depth: 1, name: 'app', dir: true },
        { depth: 2, name: 'index.html', state: 'kept' },
        { depth: 2, name: 'old.html', state: 'kept' },
        { depth: 2, name: 'dist', dir: true, state: 'new' },
        ...copied(3, false),
      ],
      note: 'Like scp: the target is an existing directory, so dist is copied into it.',
    };
  }
  return {
    rows: [
      { depth: 0, name: '/var/www', dir: true },
      { depth: 1, name: 'app', dir: true, state: exists.value ? undefined : 'new' },
      ...copied(2, exists.value),
      ...(exists.value ? [{ depth: 2, name: 'old.html', state: 'kept' as const }] : []),
    ],
    note:
      tool.value === 'library'
        ? exists.value
          ? 'The destination is exact. /var/www/app gets the contents of dist; files with the same name are replaced and other files stay.'
          : 'The destination is exact. /var/www/app becomes a copy of dist. Its parent, /var/www, must exist.'
        : 'Like scp: the target does not exist, so it becomes a copy of dist.',
  };
});

const labels: Record<State, string> = { new: 'new', replaced: 'replaced', kept: 'untouched' };
</script>

<template>
  <div class="demo">
    <div class="controls">
      <div class="group" role="radiogroup" aria-label="Tool">
        <button :class="{ on: tool === 'library' }" @click="tool = 'library'">client.upload()</button>
        <button :class="{ on: tool === 'cli' }" @click="tool = 'cli'">CLI and GitHub Action</button>
      </div>
      <label><input v-model="exists" type="checkbox" /> /var/www/app already exists</label>
      <label v-if="tool === 'cli'"><input v-model="slash" type="checkbox" /> trailing slash on the target</label>
    </div>

    <code class="command">{{ command }}</code>

    <div class="trees">
      <div class="tree">
        <div class="title">Your machine</div>
        <div v-for="row in local" :key="row.name + row.depth" class="row" :style="{ paddingLeft: `${row.depth * 18}px` }">
          <span class="icon">{{ row.dir ? '📁' : '📄' }}</span>{{ row.name }}
        </div>
      </div>
      <div class="tree">
        <div class="title">Server before</div>
        <div v-for="row in before" :key="row.name + row.depth" class="row" :style="{ paddingLeft: `${row.depth * 18}px` }">
          <span class="icon">{{ row.dir ? '📁' : '📄' }}</span>{{ row.name }}
        </div>
      </div>
      <div class="tree result">
        <div class="title">Server after</div>
        <div v-if="outcome.error" class="error">{{ outcome.error }}</div>
        <div
          v-for="(row, i) in outcome.rows ?? []"
          :key="i"
          class="row"
          :class="row.state"
          :style="{ paddingLeft: `${row.depth * 18}px` }"
        >
          <span class="icon">{{ row.dir ? '📁' : '📄' }}</span>{{ row.name }}
          <span v-if="row.state" class="tag">{{ labels[row.state] }}</span>
        </div>
      </div>
    </div>
    <p class="note">{{ outcome.note }}</p>
  </div>
</template>

<style scoped>
.demo {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: center;
  font-size: 14px;
}

.group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}

.group button {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.group button.on {
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
}

label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}

.command {
  display: block;
  margin: 14px 0;
  padding: 8px 12px;
  overflow-x: auto;
  white-space: pre;
  border-radius: 8px;
  background: var(--vp-code-block-bg);
}

.trees {
  display: grid;
  grid-template-columns: 1fr 1fr 1.6fr;
  gap: 12px;
}

@media (max-width: 640px) {
  .trees {
    grid-template-columns: 1fr;
  }
}

.tree {
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--vp-c-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
}

.tree.result {
  outline: 2px solid var(--vp-c-brand-soft);
}

.title {
  margin-bottom: 6px;
  font-family: var(--vp-font-family-base);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.row {
  line-height: 1.9;
  white-space: nowrap;
}

.icon {
  margin-right: 6px;
}

.tag {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  font-family: var(--vp-font-family-base);
  font-size: 11px;
}

.new .tag {
  color: var(--vp-c-green-1);
  background: var(--vp-c-green-soft);
}

.replaced .tag {
  color: var(--vp-c-yellow-1);
  background: var(--vp-c-yellow-soft);
}

.kept {
  color: var(--vp-c-text-3);
}

.kept .tag {
  background: var(--vp-c-default-soft);
}

.error {
  color: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-base);
}

.note {
  margin: 12px 0 0;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
</style>
