import { register } from 'node:module';

register('./esm-ext-hook.mjs', import.meta.url);
