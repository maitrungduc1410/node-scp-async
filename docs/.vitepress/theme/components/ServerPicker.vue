<script setup lang="ts">
import { computed, ref } from 'vue';
import { type Locale, useLocale } from '../i18n';

interface Server {
  id: string;
  protocol: 'SFTP' | 'SCP';
  fs: boolean;
  parallel: boolean;
  label: Record<Locale, string>;
  tip: Record<Locale, string>;
}

const servers: Server[] = [
  {
    id: 'linux',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    label: {
      en: 'Linux or macOS (OpenSSH)',
      vi: 'Linux hoặc macOS (OpenSSH)',
      zh: 'Linux 或 macOS（OpenSSH）',
    },
    tip: {
      en: 'The common case. Nothing to configure.',
      vi: 'Trường hợp phổ biến nhất, không cần cấu hình gì.',
      zh: '最常见的情况，无需任何配置。',
    },
  },
  {
    id: 'sftp-only',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    label: { en: 'SFTP only hosting', vi: 'Hosting chỉ cho SFTP', zh: '仅支持 SFTP 的主机' },
    tip: {
      en: "Hosts with ForceCommand internal-sftp refuse to run scp. 'auto' never needs it there.",
      vi: "Máy chủ đặt ForceCommand internal-sftp sẽ từ chối chạy scp. Ở đây 'auto' không bao giờ cần đến scp.",
      zh: "设置了 ForceCommand internal-sftp 的主机会拒绝运行 scp，而 'auto' 在这里根本用不到它。",
    },
  },
  {
    id: 'openwrt',
    protocol: 'SCP',
    fs: false,
    parallel: false,
    label: { en: 'OpenWrt, Dropbear', vi: 'OpenWrt, Dropbear', zh: 'OpenWrt、Dropbear' },
    tip: {
      en: "No SFTP server by default, so 'auto' falls back to SCP. protocol: 'scp' skips the probe. Remote parent directories must exist.",
      vi: "Mặc định không có SFTP server nên 'auto' chuyển sang SCP. Đặt protocol: 'scp' để bỏ qua bước dò SFTP. Thư mục cha trên máy chủ phải có sẵn.",
      zh: "默认没有 SFTP 服务器，所以 'auto' 会回退到 SCP。设置 protocol: 'scp' 可跳过 SFTP 探测。远程父目录必须已存在。",
    },
  },
  {
    id: 'device',
    protocol: 'SCP',
    fs: false,
    parallel: false,
    label: {
      en: 'Router, switch, appliance',
      vi: 'Router, switch, thiết bị chuyên dụng',
      zh: '路由器、交换机、专用设备',
    },
    tip: {
      en: 'Often SCP only and slow to log in. Paths such as flash:image.bin are passed through as is.',
      vi: 'Thường chỉ có SCP và đăng nhập chậm. Đường dẫn kiểu flash:image.bin được gửi nguyên trạng.',
      zh: '通常只支持 SCP，登录也比较慢。flash:image.bin 这类路径会原样传给设备。',
    },
  },
  {
    id: 'windows',
    protocol: 'SFTP',
    fs: true,
    parallel: true,
    label: { en: 'Windows (OpenSSH)', vi: 'Windows (OpenSSH)', zh: 'Windows（OpenSSH）' },
    tip: {
      en: 'Set remoteOs so paths use backslashes and SCP quoting is safe for cmd.exe and PowerShell.',
      vi: 'Đặt remoteOs để đường dẫn dùng dấu gạch chéo ngược và tham số SCP được đặt trong dấu nháy an toàn cho cả cmd.exe lẫn PowerShell.',
      zh: '设置 remoteOs，路径会使用反斜杠，SCP 的引号处理对 cmd.exe 和 PowerShell 都安全。',
    },
  },
];

const t = useLocale({
  en: {
    uses: 'uses',
    available: 'available',
    copies: 'Directory copies',
    parallel: 'files in parallel',
    serial: 'one file at a time',
  },
  vi: {
    uses: 'sẽ dùng',
    available: 'có sẵn',
    copies: 'Sao chép thư mục',
    parallel: 'nhiều tệp song song',
    serial: 'từng tệp một',
  },
  zh: {
    uses: '会使用',
    available: '可用',
    copies: '目录复制',
    parallel: '多个文件并行',
    serial: '逐个文件',
  },
});
const locale = useLocale<Locale>({ en: 'en', vi: 'vi', zh: 'zh' });

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
        {{ s.label[locale] }}
      </button>
    </div>
    <div class="facts">
      <div class="fact">
        <span class="label"><code>protocol: 'auto'</code> {{ t.uses }}</span>
        <span class="value" :class="server.protocol.toLowerCase()">{{ server.protocol }}</span>
      </div>
      <div class="fact">
        <span class="label"><code>client.fs</code></span>
        <span class="value" :class="server.fs ? 'yes' : 'no'">{{ server.fs ? t.available : 'undefined' }}</span>
      </div>
      <div class="fact">
        <span class="label">{{ t.copies }}</span>
        <span class="value">{{ server.parallel ? t.parallel : t.serial }}</span>
      </div>
    </div>
    <p class="tip">{{ server.tip[locale] }}</p>
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
