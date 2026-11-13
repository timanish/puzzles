import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Phones only allow camera access over HTTPS.
// Run "npm run dev:phone" to serve with a self-signed certificate on the local network.
const https = Boolean(process.env.HTTPS);

export default defineConfig({
  // Relative asset paths let the build run from any folder, such as username.github.io/camera/.
  base: './',
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  worker: { format: 'es' },
});
