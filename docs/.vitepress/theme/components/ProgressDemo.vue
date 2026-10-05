<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useLocale } from '../i18n';

interface File {
  path: string;
  size: number;
  done: number;
}

const SOURCE = [
  { path: 'index.html', size: 14_000 },
  { path: 'assets/app.js', size: 480_000 },
  { path: 'assets/app.css', size: 96_000 },
  { path: 'assets/logo.png', size: 220_000 },
  { path: 'docs/manual.pdf', size: 1_300_000 },
  { path: 'favicon.ico', size: 15_000 },
];
const t = useLocale({
  en: {
    connected: 'connected over {protocol}',
    notCalled: 'not called yet',
    start: 'Start',
    again: 'Run again',
    of: 'of',
    files: 'files',
    last: 'Last',
    call: 'call',
    soFar: '{n} so far',
    sftp: 'SFTP copies up to {concurrency} files at once (4 by default).',
    scp: 'SCP streams one file at a time over a single channel.',
    unknown:
      ' An SCP download learns about each file only when the server sends it, so {total} and {filesTotal} are {undefined}.',
  },
  vi: {
    connected: 'đã kết nối qua {protocol}',
    notCalled: 'chưa được gọi',
    start: 'Bắt đầu',
    again: 'Chạy lại',
    of: '/',
    files: 'tệp',
    last: 'Lần gọi',
    call: 'gần nhất',
    soFar: '{n} lần đến giờ',
    sftp: 'SFTP sao chép tối đa {concurrency} tệp cùng lúc (mặc định là 4).',
    scp: 'SCP truyền từng tệp một qua một channel duy nhất.',
    unknown:
      ' Khi tải xuống qua SCP, node-scp chỉ biết về từng tệp lúc máy chủ gửi nó tới, nên {total} và {filesTotal} là {undefined}.',
  },
  zh: {
    connected: '已通过 {protocol} 连接',
    notCalled: '尚未调用',
    start: '开始',
    again: '再运行一次',
    of: '/',
    files: '个文件',
    last: '最近一次',
    call: '调用',
    soFar: '累计 {n} 次',
    sftp: 'SFTP 最多同时复制 {concurrency} 个文件（默认 4 个）。',
    scp: 'SCP 在单个通道上逐个传输文件。',
    unknown:
      '通过 SCP 下载时，只有服务器发来某个文件时才知道它的存在，因此 {total} 和 {filesTotal} 为 {undefined}。',
  },
});

/** Splits a message around `{name}` placeholders, which the template renders as code. */
function parts(message: string): { text: string; code: boolean }[] {
  return message.split(/\{(\w+)\}/).map((text, i) => ({ text, code: i % 2 === 1 }));
}

const BYTES_PER_SECOND = 900_000;
const TICK_MS = 50;

const protocol = ref<'sftp' | 'scp'>('sftp');
const direction = ref<'upload' | 'download'>('upload');
const files = reactive<File[]>(SOURCE.map((f) => ({ ...f, done: 0 })));
const status = ref<'idle' | 'running' | 'done' | 'aborted'>('idle');
const calls = ref(0);
const last = ref<Record<string, unknown> | undefined>();
let timer: ReturnType<typeof setInterval> | undefined;

const totalBytes = SOURCE.reduce((sum, f) => sum + f.size, 0);
const transferred = computed(() => files.reduce((sum, f) => sum + f.done, 0));
const completed = computed(() => files.filter((f) => f.done === f.size).length);
const concurrency = computed(() => (protocol.value === 'sftp' ? 4 : 1));
// SCP downloads learn about each file only when the server sends it.
const totalsKnown = computed(() => !(protocol.value === 'scp' && direction.value === 'download'));

function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

function start() {
  stop();
  for (const f of files) f.done = 0;
  calls.value = 0;
  last.value = undefined;
  status.value = 'running';
  timer = setInterval(tick, TICK_MS);
}

function abort() {
  stop();
  status.value = 'aborted';
}

function tick() {
  const active = files.filter((f) => f.done < f.size).slice(0, concurrency.value);
  if (active.length === 0) {
    stop();
    status.value = 'done';
    return;
  }
  const share = (BYTES_PER_SECOND * TICK_MS) / 1000 / active.length;
  for (const f of active) {
    f.done = Math.min(f.size, f.done + Math.round(share));
    calls.value += 1;
    last.value = {
      path: f.path,
      fileTransferred: f.done,
      fileSize: f.size,
      transferred: transferred.value,
      total: totalsKnown.value ? totalBytes : undefined,
      filesCompleted: completed.value,
      filesTotal: totalsKnown.value ? SOURCE.length : undefined,
    };
  }
}

function pick(next: { protocol?: 'sftp' | 'scp'; direction?: 'upload' | 'download' }) {
  if (status.value === 'running') return;
  if (next.protocol) protocol.value = next.protocol;
  if (next.direction) direction.value = next.direction;
  status.value = 'idle';
  for (const f of files) f.done = 0;
  last.value = undefined;
  calls.value = 0;
}

const code = computed(() => {
  const call =
    direction.value === 'upload'
      ? "client.upload('./site', '/srv/site', {"
      : "client.download('/srv/site', './site', {";
  const via = t.value.connected.replace('{protocol}', protocol.value.toUpperCase());
  return `// ${via}\nconst result = await ${call}\n  recursive: true,\n  onProgress: (p) => render(p),\n  signal: controller.signal,\n});`;
});

const shown = computed(() => {
  if (!last.value) return `// ${t.value.notCalled}`;
  const lines = Object.entries(last.value).map(
    ([key, value]) => `  ${key}: ${typeof value === 'string' ? `'${value}'` : String(value)},`,
  );
  return `{\n${lines.join('\n')}\n}`;
});

const outcome = computed(() => {
  if (status.value === 'done') {
    return `result = { files: ${SOURCE.length}, directories: 3, bytes: ${totalBytes} }`;
  }
  if (status.value === 'aborted') {
    return "throws ScpError { code: 'ERR_ABORTED', message: 'Operation aborted' }";
  }
  return '';
});

const percent = computed(() =>
  totalsKnown.value ? Math.floor((transferred.value / totalBytes) * 100) : undefined,
);

const kb = (n: number) => `${Math.round(n / 1000)} kB`;

onBeforeUnmount(stop);
</script>

<template>
  <div class="demo">
    <div class="controls">
      <div class="group">
        <button :class="{ on: protocol === 'sftp' }" @click="pick({ protocol: 'sftp' })">SFTP</button>
        <button :class="{ on: protocol === 'scp' }" @click="pick({ protocol: 'scp' })">SCP</button>
      </div>
      <div class="group">
        <button :class="{ on: direction === 'upload' }" @click="pick({ direction: 'upload' })">upload</button>
        <button :class="{ on: direction === 'download' }" @click="pick({ direction: 'download' })">download</button>
      </div>
      <span class="spacer" />
      <button class="action" :disabled="status === 'running'" @click="start">
        {{ status === 'idle' ? t.start : t.again }}
      </button>
      <button class="action danger" :disabled="status !== 'running'" @click="abort">controller.abort()</button>
    </div>

    <pre class="code">{{ code }}</pre>

    <div class="overall">
      <div class="bar"><div class="fill" :style="{ width: `${(transferred / totalBytes) * 100}%` }" /></div>
      <span>
        {{ kb(transferred) }}<template v-if="totalsKnown"> {{ t.of }} {{ kb(totalBytes) }} ({{ percent }}%)</template>,
        {{ completed }}<template v-if="totalsKnown"> {{ t.of }} {{ files.length }}</template> {{ t.files }}
      </span>
    </div>

    <div class="panes">
      <div class="files">
        <div v-for="f in files" :key="f.path" class="file" :class="{ active: f.done > 0 && f.done < f.size }">
          <span class="name">{{ f.path }}</span>
          <div class="bar small"><div class="fill" :style="{ width: `${(f.done / f.size) * 100}%` }" /></div>
        </div>
      </div>
      <div class="event">
        <div class="title">{{ t.last }} <code>onProgress</code> {{ t.call }} <span class="count">({{ t.soFar.replace('{n}', String(calls)) }})</span></div>
        <pre>{{ shown }}</pre>
      </div>
    </div>

    <p v-if="outcome" class="outcome" :class="status">{{ outcome }}</p>
    <p class="note">
      <template v-for="(part, i) in parts(protocol === 'sftp' ? t.sftp : t.scp)" :key="`a${i}`"><code v-if="part.code">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>
      <template v-if="!totalsKnown">
        <template v-for="(part, i) in parts(t.unknown)" :key="`b${i}`"><code v-if="part.code">{{ part.text }}</code><template v-else>{{ part.text }}</template></template>
      </template>
    </p>
  </div>
</template>

<style scoped>
.demo {
  margin: 16px 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  font-size: 14px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.spacer {
  flex: 1;
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

.action {
  padding: 4px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
}

.action.danger {
  background: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-mono);
  font-weight: 400;
}

.action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.code,
.event pre {
  margin: 12px 0;
  padding: 10px 12px;
  overflow-x: auto;
  border-radius: 8px;
  background: var(--vp-code-block-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
}

.overall {
  display: flex;
  gap: 12px;
  align-items: center;
  font-variant-numeric: tabular-nums;
}

.bar {
  flex: 1;
  height: 10px;
  border-radius: 5px;
  background: var(--vp-c-default-soft);
  overflow: hidden;
}

.bar.small {
  height: 6px;
}

.fill {
  height: 100%;
  background: var(--vp-c-brand-1);
  transition: width 50ms linear;
}

.panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-top: 12px;
}

.file {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 10px;
  align-items: center;
  padding: 3px 0;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.file.active {
  color: var(--vp-c-text-1);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
}

.count {
  font-weight: 400;
}

.event pre {
  margin-top: 6px;
}

.outcome {
  margin: 8px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
}

.outcome.done {
  color: var(--vp-c-green-1);
  background: var(--vp-c-green-soft);
}

.outcome.aborted {
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}

.note {
  margin: 12px 0 0;
  color: var(--vp-c-text-2);
}
</style>
