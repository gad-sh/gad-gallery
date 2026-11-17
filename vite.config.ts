import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import mkcert from 'vite-plugin-mkcert';
import os from 'node:os';

// The museum's API and pictures are fetched through this origin (src/museum.ts says why):
// /collection/… and /art/… are proxied by the dev and preview servers here, and by rewrites on
// a host (vercel.json).
const proxy = {
  '/collection': {
    target: 'https://openaccess-api.clevelandart.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/collection/, ''),
  },
  '/art': {
    target: 'https://openaccess-cdn.clevelandart.org',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/art/, ''),
  },
};

// mkcert serves over https with a locally trusted certificate: browsers only offer WebXR
// (Enter VR / AR) on https or localhost, and a headset or a phone isn't localhost.
// SALON_HTTP=1 serves plain http instead (headless checks on localhost).
//
// A QR code on the page hands the show to a phone or a headset. From localhost that link
// has to name this machine on the network instead, so the dev server tells the page its
// address (dev only; start it with `pnpm dev:lan` so other devices can reach it).
const lan = Object.values(os.networkInterfaces())
  .flat()
  .find((address) => address && address.family === 'IPv4' && !address.internal)?.address;

// `base: './'` makes the build's own URLs relative, so the same files work at a site's root
// and under a path (gad.sh/museum/, which forwards to this project with the path removed).
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [svelte(), ...(process.env.SALON_HTTP ? [] : [mkcert()])],
  define: { __LAN_HOST__: JSON.stringify(command === 'serve' ? (lan ?? '') : '') },
  server: { proxy },
  preview: { proxy },
}));
