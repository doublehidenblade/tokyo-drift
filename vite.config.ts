import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /tokyo-drift/, so assets need that base.
// The Android (Capacitor) build bundles everything locally -> relative paths.
const base = process.env.CAPACITOR ? './' : '/tokyo-drift/';

export default defineConfig({
  plugins: [react()],
  base,
});
