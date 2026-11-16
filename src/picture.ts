// The showcase's own A-Frame components.
//   picture="<url>" — a 1 × 1 plane showing an image, unlit, so a painting keeps its colors.
//                     Scale the entity to the picture's size. A dark slate until it has loaded.
//   halo            — a soft pool of light on the wall behind a work.
// The URL is the whole attribute (a single-property schema), so nothing in it is split on `;`.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const AFRAME: any;
const { THREE } = AFRAME;

// One texture per URL, shared by every plane showing it (the work and its reflection), and
// freed when the last one goes.
const textures = new Map<string, { texture: any; users: number; ready: Promise<any> }>();

function acquire(url: string, anisotropy: number) {
	let entry = textures.get(url);
	if (!entry) {
		let texture: any;
		const ready = new Promise<any>((resolve, reject) => {
			texture = new THREE.TextureLoader().load(url, resolve, undefined, reject);
		});
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = anisotropy;
		entry = { texture, users: 0, ready };
		textures.set(url, entry);
	}
	entry.users++;
	return entry;
}

function release(url: string) {
	const entry = textures.get(url);
	if (!entry || --entry.users > 0) return;
	entry.texture.dispose();
	textures.delete(url);
}

const plane = new THREE.PlaneGeometry(1, 1);

AFRAME.registerComponent('picture', {
	schema: { type: 'string' },

	init(this: any) {
		this.material = new THREE.MeshBasicMaterial({ color: '#16181d' });
		this.el.setObject3D('mesh', new THREE.Mesh(plane, this.material));
	},

	update(this: any, old: string) {
		if (old) release(old);
		const url = this.data;
		if (!url) return;
		const anisotropy = this.el.sceneEl.renderer?.capabilities.getMaxAnisotropy() ?? 1;
		const entry = acquire(url, Math.min(8, anisotropy));
		entry.ready.then(
			() => {
				if (this.data !== url || !this.material) return;
				this.material.map = entry.texture;
				this.material.color.set('#ffffff');
				this.material.needsUpdate = true;
				this.el.emit('picture-loaded', { url }, false);
			},
			() => this.el.emit('picture-error', { url }, false),
		);
	},

	remove(this: any) {
		if (this.data) release(this.data);
		this.el.removeObject3D('mesh');
		this.material.dispose();
		this.material = null;
	},
});

let glow: any;
function glowTexture() {
	if (glow) return glow;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 128;
	const context = canvas.getContext('2d')!;
	const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
	gradient.addColorStop(0, 'rgba(255, 236, 204, 0.55)');
	gradient.addColorStop(0.45, 'rgba(255, 236, 204, 0.2)');
	gradient.addColorStop(1, 'rgba(255, 236, 204, 0)');
	context.fillStyle = gradient;
	context.fillRect(0, 0, 128, 128);
	glow = new THREE.CanvasTexture(canvas);
	glow.colorSpace = THREE.SRGBColorSpace;
	return glow;
}

AFRAME.registerComponent('halo', {
	schema: { opacity: { default: 1 } },

	init(this: any) {
		this.material = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false });
		// Not 'mesh': nothing should hit it (tap-to-move looks at every visible mesh, and a
		// halo reaching the floor line shouldn't count as something in the way).
		const mesh = new THREE.Mesh(plane, this.material);
		mesh.raycast = () => {};
		this.el.setObject3D('halo', mesh);
	},

	update(this: any) {
		this.material.opacity = this.data.opacity;
	},

	remove(this: any) {
		this.el.removeObject3D('halo');
		this.material.dispose();
	},
});
