import { readFileSync } from 'node:fs';
import { type DefaultTheme, defineConfig, type HeadConfig, type PageData } from 'vitepress';

const repo = 'https://github.com/maitrungduc1410/node-scp-async';
const base = '/node-scp-async/';
// Production origin and base. Sitemap entries and canonical links are built from it.
const site = `https://maitrungduc1410.github.io${base}`;
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

// Written by `pnpm docs:api` (TypeDoc) before VitePress runs.
const apiSidebar = JSON.parse(
  readFileSync(new URL('../api/typedoc-sidebar.json', import.meta.url), 'utf8'),
) as DefaultTheme.SidebarItem[];

const groups = [
  ['/guide/', '/guide/getting-started'],
  [
    '/guide/connecting',
    '/guide/transfers',
    '/guide/progress',
    '/guide/files-in-memory',
    '/guide/remote-fs',
    '/guide/protocols',
    '/guide/errors',
  ],
  ['/guide/cli', '/recipes/github-actions'],
  ['/recipes/atomic-deploy', '/recipes/openwrt-dropbear', '/recipes/network-devices'],
  ['/migration/from-0.x', '/migration/from-scp2'],
  ['/scp-vs-sftp', '/comparison'],
] as const;

type Page = (typeof groups)[number][number];

interface Labels {
  guide: string;
  api: string;
  changelog: string;
  architecture: string;
  groups: [string, string, string, string, string, string];
  pages: Record<Page, string>;
}

const en: Labels = {
  guide: 'Guide',
  api: 'API reference',
  changelog: 'Changelog',
  architecture: 'Architecture',
  groups: ['Introduction', 'Using the library', 'Tools', 'Recipes', 'Upgrading', 'Background'],
  pages: {
    '/guide/': 'What is node-scp?',
    '/guide/getting-started': 'Getting started',
    '/guide/connecting': 'Connecting',
    '/guide/transfers': 'Upload and download',
    '/guide/progress': 'Progress and cancelling',
    '/guide/files-in-memory': 'Files in memory',
    '/guide/remote-fs': 'Remote filesystem',
    '/guide/protocols': 'Choosing the protocol',
    '/guide/errors': 'Handling errors',
    '/guide/cli': 'Command line',
    '/recipes/github-actions': 'GitHub Action',
    '/recipes/atomic-deploy': 'Zero downtime deploys',
    '/recipes/openwrt-dropbear': 'OpenWrt and Dropbear',
    '/recipes/network-devices': 'Routers and switches',
    '/migration/from-0.x': 'From node-scp 0.x',
    '/migration/from-scp2': 'From scp2',
    '/scp-vs-sftp': 'SCP or SFTP in 2026?',
    '/comparison': 'How node-scp compares',
  },
};

const vi: Labels = {
  guide: 'Hướng dẫn',
  api: 'Tài liệu API',
  changelog: 'Nhật ký thay đổi',
  architecture: 'Kiến trúc',
  groups: ['Giới thiệu', 'Dùng thư viện', 'Công cụ', 'Ví dụ thực tế', 'Nâng cấp', 'Kiến thức nền'],
  pages: {
    '/guide/': 'node-scp là gì?',
    '/guide/getting-started': 'Bắt đầu',
    '/guide/connecting': 'Kết nối',
    '/guide/transfers': 'Tải lên và tải xuống',
    '/guide/progress': 'Tiến độ và hủy',
    '/guide/files-in-memory': 'Tệp trong bộ nhớ',
    '/guide/remote-fs': 'Hệ thống tệp từ xa',
    '/guide/protocols': 'Chọn giao thức',
    '/guide/errors': 'Xử lý lỗi',
    '/guide/cli': 'Dòng lệnh',
    '/recipes/github-actions': 'GitHub Action',
    '/recipes/atomic-deploy': 'Deploy không downtime',
    '/recipes/openwrt-dropbear': 'OpenWrt và Dropbear',
    '/recipes/network-devices': 'Router và switch',
    '/migration/from-0.x': 'Từ node-scp 0.x',
    '/migration/from-scp2': 'Từ scp2',
    '/scp-vs-sftp': 'SCP hay SFTP vào năm 2026?',
    '/comparison': 'So sánh với thư viện khác',
  },
};

const zh: Labels = {
  guide: '指南',
  api: 'API 参考',
  changelog: '更新日志',
  architecture: '架构',
  groups: ['入门', '使用指南', '工具', '实战示例', '升级', '背景知识'],
  pages: {
    '/guide/': '什么是 node-scp？',
    '/guide/getting-started': '快速开始',
    '/guide/connecting': '连接',
    '/guide/transfers': '上传与下载',
    '/guide/progress': '进度与取消',
    '/guide/files-in-memory': '内存中的文件',
    '/guide/remote-fs': '远程文件系统',
    '/guide/protocols': '选择协议',
    '/guide/errors': '错误处理',
    '/guide/cli': '命令行',
    '/recipes/github-actions': 'GitHub Action',
    '/recipes/atomic-deploy': '零停机部署',
    '/recipes/openwrt-dropbear': 'OpenWrt 与 Dropbear',
    '/recipes/network-devices': '路由器与交换机',
    '/migration/from-0.x': '从 node-scp 0.x 升级',
    '/migration/from-scp2': '从 scp2 迁移',
    '/scp-vs-sftp': '2026 年该用 SCP 还是 SFTP？',
    '/comparison': '与同类库对比',
  },
};

function themeConfig(prefix: string, l: Labels): DefaultTheme.Config {
  return {
    nav: [
      {
        text: l.guide,
        link: `${prefix}/guide/`,
        activeMatch: `^${prefix}/(guide|recipes|migration)/`,
      },
      { text: l.api, link: '/api/', activeMatch: '^/api/' },
      {
        text: `v${version}`,
        items: [
          { text: l.changelog, link: `${repo}/blob/master/CHANGELOG.md` },
          { text: 'npm', link: 'https://www.npmjs.com/package/node-scp' },
          { text: l.architecture, link: `${repo}/blob/master/ARCHITECTURE.md` },
        ],
      },
    ],
    sidebar: {
      '/api/': [{ text: l.api, link: '/api/', items: apiSidebar }],
      [`${prefix}/`]: groups.map((pages, i) => ({
        text: l.groups[i]!,
        items: pages.map((page) => ({ text: l.pages[page], link: prefix + page })),
      })),
    },
  };
}

// Locale metadata for hreflang, og:locale and the preview image alt text.
const seoLocales = {
  root: {
    prefix: '',
    lang: 'en-US',
    og: 'en_US',
    imageAlt: 'node-scp: files moving from a laptop to a server over SFTP and SCP',
  },
  vi: {
    prefix: 'vi/',
    lang: 'vi-VN',
    og: 'vi_VN',
    imageAlt: 'node-scp: các tệp được chuyển từ laptop lên máy chủ qua SFTP và SCP',
  },
  zh: {
    prefix: 'zh/',
    lang: 'zh-CN',
    og: 'zh_CN',
    imageAlt: 'node-scp：文件通过 SFTP 和 SCP 从笔记本电脑传到服务器',
  },
} as const;
type SeoLocale = keyof typeof seoLocales;

function localeOf(page: string): SeoLocale {
  const first = page.split('/')[0];
  return first === 'vi' || first === 'zh' ? first : 'root';
}

/** `vi/guide/index.md` -> `vi/guide/`, `api/node-scp/functions/connect.md` -> `api/...connect`. */
function pageUrl(page: string): string {
  return page.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
}

const kinds: Record<string, (name: string) => string> = {
  classes: (name) => `The ${name} class`,
  functions: (name) => `The ${name}() function`,
  interfaces: (name) => `The ${name} interface`,
  'type-aliases': (name) => `The ${name} type`,
  variables: (name) => (name === 'default' ? 'The default export' : `The ${name} constant`),
};

/** The summary of a generated page (the prose before its first section), as plain text. */
function summaryOf(relativePath: string): string {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
  const intro = source.replace(/```[\s\S]*?```/g, '').split(/\n## /)[0]!;
  const prose = intro
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block !== '' && !/^[#|*>-]/.test(block) && !block.startsWith('<'));
  return (prose ?? '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`|\*\*|~~/g, '')
    .replace(/\\([<>|_*])/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/:$/, '.')
    .trim();
}

const details: Record<string, string> = {
  module: 'Lists every class, function, interface and type it exports.',
  classes: 'Constructor, properties and methods with their types.',
  functions: 'Signature, parameters and return value.',
  interfaces: 'Every property with its type and description.',
  'type-aliases': 'The full TypeScript definition.',
  variables: 'Its type and every member.',
};

/** Pads a short description with what the page lists, then cuts it at a word near 160 chars. */
function clamp(text: string, kind: string): string {
  const padded = text.length < 110 && details[kind] ? `${text} ${details[kind]}` : text;
  if (padded.length <= 160) return padded;
  const cut = padded.slice(0, 159);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '')}…`;
}

/** Description for generated TypeDoc pages, which have no frontmatter. */
function apiDescription(relativePath: string): string | undefined {
  if (relativePath === 'api/index.md') {
    return 'API reference for node-scp, node-scp/legacy and node-scp/scp2: every exported function, class, option interface and error code, generated from the source.';
  }
  const m = relativePath.match(/^api\/(node-scp(?:\/legacy|\/scp2)?)\/(?:([\w-]+)\/)?([^/]+)\.md$/);
  if (!m) return undefined;
  const [, module, kind, name] = m as unknown as [string, string, string | undefined, string];
  const summary = summaryOf(relativePath);
  if (kind === undefined) {
    return clamp(`API reference for the ${module} module. ${summary}`, 'module');
  }
  const subject = kinds[kind]?.(name);
  if (!subject) return undefined;
  return clamp(
    summary
      ? `${subject} in ${module}. ${summary}`
      : `${subject} in ${module}, generated from the TypeScript source.`,
    kind,
  );
}

export default defineConfig({
  title: 'node-scp',
  description:
    'Copy files to and from any SSH server from Node.js, over SFTP or SCP, including Dropbear, OpenWrt and network devices without SFTP.',
  base,
  cleanUrls: true,
  // Snippets included into other pages, not pages of their own.
  srcExclude: ['**/parts/**'],
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
    ['meta', { name: 'theme-color', content: '#2563eb' }],
    [
      'meta',
      { name: 'google-site-verification', content: 'tQKWpMESb7_XYCOMCID91lFgoQ4_dt3sqGoXzuRu-ZQ' },
    ],
  ],
  sitemap: {
    // VitePress 1.6 builds entry URLs without `base`, so the hostname carries it.
    hostname: site,
    transformItems: (items) =>
      items.map((item) => {
        const en = item.links?.find((link) => link.lang === seoLocales.root.lang);
        return en ? { ...item, links: [...item.links!, { lang: 'x-default', url: en.url }] } : item;
      }),
  },
  transformPageData(pageData: PageData) {
    const description = apiDescription(pageData.relativePath);
    if (description && !pageData.frontmatter.description) {
      return { description, frontmatter: { ...pageData.frontmatter, description } };
    }
  },
  transformHead({ page, pageData, siteConfig, title, description }) {
    if (page === '404.md' || pageData.isNotFound) {
      return [['meta', { name: 'robots', content: 'noindex' }]];
    }
    const locale = localeOf(page);
    const key = locale === 'root' ? page : page.slice(locale.length + 1);
    const url = site + pageUrl(page);
    const exists = new Set(siteConfig.pages);
    const variants = (Object.keys(seoLocales) as SeoLocale[]).filter((l) =>
      exists.has(seoLocales[l].prefix + key),
    );
    const image = `${site}og.png`;
    const imageAlt = seoLocales[locale].imageAlt;

    const head: HeadConfig[] = [['link', { rel: 'canonical', href: url }]];
    if (variants.length > 1) {
      for (const l of variants) {
        head.push([
          'link',
          {
            rel: 'alternate',
            hreflang: seoLocales[l].lang,
            href: site + pageUrl(seoLocales[l].prefix + key),
          },
        ]);
      }
      if (variants.includes('root')) {
        head.push(['link', { rel: 'alternate', hreflang: 'x-default', href: site + pageUrl(key) }]);
      }
    }
    const og: [string, string][] = [
      ['og:type', pageData.frontmatter.layout === 'home' ? 'website' : 'article'],
      ['og:site_name', 'node-scp'],
      ['og:title', title],
      ['og:description', description],
      ['og:url', url],
      ['og:locale', seoLocales[locale].og],
      ...variants
        .filter((l) => l !== locale)
        .map((l): [string, string] => ['og:locale:alternate', seoLocales[l].og]),
      ['og:image', image],
      ['og:image:type', 'image/png'],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', imageAlt],
    ];
    for (const [property, content] of og) head.push(['meta', { property, content }]);
    const twitter: [string, string][] = [
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', title],
      ['twitter:description', description],
      ['twitter:image', image],
      ['twitter:image:alt', imageAlt],
    ];
    for (const [name, content] of twitter) head.push(['meta', { name, content }]);
    return head;
  },
  // Mermaid's large chunks load lazily, only on pages that have a diagram.
  vite: { build: { chunkSizeWarningLimit: 4000 } },
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]!;
        if (token.info.trim() === 'mermaid') {
          return `<MermaidDiagram code="${encodeURIComponent(token.content)}" />`;
        }
        return fence(tokens, idx, options, env, self);
      };
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: themeConfig('', en),
    },
    vi: {
      label: 'Tiếng Việt',
      lang: 'vi-VN',
      description:
        'Sao chép tệp tới mọi máy chủ SSH từ Node.js qua SFTP hoặc SCP, kể cả Dropbear, OpenWrt và thiết bị mạng không có SFTP.',
      themeConfig: {
        ...themeConfig('/vi', vi),
        outline: { level: [2, 3], label: 'Trên trang này' },
        docFooter: { prev: 'Trang trước', next: 'Trang sau' },
        lastUpdated: { text: 'Cập nhật lần cuối' },
        editLink: {
          pattern: `${repo}/edit/master/docs/:path`,
          text: 'Sửa trang này trên GitHub',
        },
        returnToTopLabel: 'Về đầu trang',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Giao diện',
        lightModeSwitchTitle: 'Chuyển sang giao diện sáng',
        darkModeSwitchTitle: 'Chuyển sang giao diện tối',
        langMenuLabel: 'Đổi ngôn ngữ',
        notFound: {
          title: 'KHÔNG TÌM THẤY TRANG',
          quote: 'Trang bạn tìm không tồn tại hoặc đã được chuyển đi.',
          linkLabel: 'về trang chủ',
          linkText: 'Về trang chủ',
        },
        footer: { message: 'Phát hành theo giấy phép MIT.' },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      description:
        '在 Node.js 中通过 SFTP 或 SCP 与任意 SSH 服务器互传文件，也支持没有 SFTP 的 Dropbear、OpenWrt 和网络设备。',
      themeConfig: {
        ...themeConfig('/zh', zh),
        outline: { level: [2, 3], label: '本页内容' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新于' },
        editLink: {
          pattern: `${repo}/edit/master/docs/:path`,
          text: '在 GitHub 上编辑此页',
        },
        returnToTopLabel: '回到顶部',
        sidebarMenuLabel: '菜单',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        langMenuLabel: '切换语言',
        notFound: {
          title: '页面未找到',
          quote: '你访问的页面不存在或已被移动。',
          linkLabel: '返回首页',
          linkText: '返回首页',
        },
        footer: { message: '基于 MIT 许可证发布。' },
      },
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: repo }],
    search: {
      provider: 'local',
      options: {
        locales: {
          vi: {
            translations: {
              button: { buttonText: 'Tìm kiếm', buttonAriaLabel: 'Tìm kiếm' },
              modal: {
                displayDetails: 'Hiển thị chi tiết',
                resetButtonTitle: 'Xóa tìm kiếm',
                backButtonTitle: 'Đóng tìm kiếm',
                noResultsText: 'Không có kết quả cho',
                footer: { selectText: 'chọn', navigateText: 'di chuyển', closeText: 'đóng' },
              },
            },
          },
          zh: {
            translations: {
              button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '清除查询',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关结果',
                footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
              },
            },
          },
        },
      },
    },
    editLink: {
      // Serialized into the client bundle, so it cannot use variables from this file. API pages
      // are generated from the doc comments in src.
      pattern: ({ filePath }) =>
        filePath.startsWith('api/')
          ? 'https://github.com/maitrungduc1410/node-scp-async/tree/master/src'
          : `https://github.com/maitrungduc1410/node-scp-async/edit/master/docs/${filePath}`,
      text: 'Edit this page on GitHub',
    },
    outline: { level: [2, 3] },
    footer: { message: 'Released under the MIT License.' },
  },
});
