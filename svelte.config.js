import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: { files: { assets: '.build/public-static' }, adapter: adapter({ strict: true }) },
};
