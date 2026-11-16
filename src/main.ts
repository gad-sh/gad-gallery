// A-Frame first: it defines the AFRAME and THREE globals that the kit reads.
import 'aframe';
// Teleport in a headset (`blink-controls`, left thumbstick).
import '@gadxr/aframe-blink-controls';
// Tap or click the floor to walk there, on a phone and a desktop (`tap-to-move`).
import '@gadxr/aframe-tap-to-move';
// The showcase's own A-Frame components: `picture` and `halo`.
import './picture';
import { mount } from 'svelte';
import App from './App.svelte';

export default mount(App, { target: document.getElementById('app')! });
