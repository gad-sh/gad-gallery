/// <reference types="svelte" />
/// <reference types="vite/client" />

// The address of the dev machine on the network ("" in a build). See vite.config.ts.
declare const __LAN_HOST__: string;
// A-Frame sets these globals (no types).
declare const AFRAME: any;
declare const THREE: any;
declare module "aframe";
