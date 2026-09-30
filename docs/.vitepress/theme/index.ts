import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import BenchChart from './components/BenchChart.vue';
import DestinationDemo from './components/DestinationDemo.vue';
import HeroArt from './components/HeroArt.vue';
import MermaidDiagram from './components/MermaidDiagram.vue';
import ProgressDemo from './components/ProgressDemo.vue';
import ServerPicker from './components/ServerPicker.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, { 'home-hero-image': () => h(HeroArt) }),
  enhanceApp({ app }) {
    app.component('BenchChart', BenchChart);
    app.component('DestinationDemo', DestinationDemo);
    app.component('MermaidDiagram', MermaidDiagram);
    app.component('ProgressDemo', ProgressDemo);
    app.component('ServerPicker', ServerPicker);
  },
} satisfies Theme;
