import { readFileSync } from 'node:fs';
import { type DefaultTheme, defineConfig } from 'vitepress';

const repo = 'https://github.com/maitrungduc1410/node-scp-async';
const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };

// Written by `pnpm docs:api` (TypeDoc) before VitePress runs.
const apiSidebar = JSON.parse(
  readFileSync(new URL('../api/typedoc-sidebar.json', import.meta.url), 'utf8'),
) as DefaultTheme.SidebarItem[];

const guide: DefaultTheme.SidebarItem[] = [
  {
    text: 'Introduction',
    items: [
      { text: 'What is node-scp?', link: '/guide/' },
      { text: 'Getting started', link: '/guide/getting-started' },
    ],
  },
  {
    text: 'Using the library',
    items: [
      { text: 'Connecting', link: '/guide/connecting' },
      { text: 'Upload and download', link: '/guide/transfers' },
      { text: 'Progress and cancelling', link: '/guide/progress' },
      { text: 'Files in memory', link: '/guide/files-in-memory' },
      { text: 'Remote filesystem', link: '/guide/remote-fs' },
      { text: 'Choosing the protocol', link: '/guide/protocols' },
      { text: 'Handling errors', link: '/guide/errors' },
    ],
  },
  {
    text: 'Tools',
    items: [
      { text: 'Command line', link: '/guide/cli' },
      { text: 'GitHub Action', link: '/recipes/github-actions' },
    ],
  },
  {
    text: 'Recipes',
    items: [
      { text: 'Zero downtime deploys', link: '/recipes/atomic-deploy' },
      { text: 'OpenWrt and Dropbear', link: '/recipes/openwrt-dropbear' },
      { text: 'Routers and switches', link: '/recipes/network-devices' },
    ],
  },
  {
    text: 'Upgrading',
    items: [
      { text: 'From node-scp 0.x', link: '/migration/from-0.x' },
      { text: 'From scp2', link: '/migration/from-scp2' },
    ],
  },
  {
    text: 'Background',
    items: [
      { text: 'SCP or SFTP in 2026?', link: '/scp-vs-sftp' },
      { text: 'How node-scp compares', link: '/comparison' },
    ],
  },
];

export default defineConfig({
  title: 'node-scp',
  description: 'Copy files to and from any SSH server from Node.js, over SFTP or SCP.',
  base: '/node-scp-async/',
  cleanUrls: true,
  // Snippets included into other pages, not pages of their own.
  srcExclude: ['parts/**'],
  lastUpdated: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/node-scp-async/logo.svg' }]],
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
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '^/(guide|recipes|migration)/' },
      { text: 'API reference', link: '/api/', activeMatch: '^/api/' },
      {
        text: `v${version}`,
        items: [
          { text: 'Changelog', link: `${repo}/blob/master/CHANGELOG.md` },
          { text: 'npm', link: 'https://www.npmjs.com/package/node-scp' },
          { text: 'Architecture', link: `${repo}/blob/master/ARCHITECTURE.md` },
        ],
      },
    ],
    sidebar: {
      '/api/': [{ text: 'API reference', link: '/api/', items: apiSidebar }],
      '/': guide,
    },
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
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
