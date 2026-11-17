<script lang="ts">
	// Salon: search a museum's open collection and a gallery builds itself around you, every
	// work at its real size. Walk it on a phone (tap the floor), a desktop, or in a headset
	// (teleport). Then press AR and hang the same works on your own wall, at true size.
	// One page: the panels are HTML on a screen and 3D in a headset (the kit's Surface).
	import { Button, ButtonGroup, Checkbox, Input, Keyboard, Modal, Panel, ProgressBar, RadialMenu, Scene3D, Stack, Surface, Tag, Text, ThemeProvider, Toaster, createTheme, everyFrame, toaster, xr } from '@xr-kit/ui';
	import Door from './Door.svelte';
	import Hanging from './Hanging.svelte';
	import Qr from './Qr.svelte';
	import { layoutGallery, placeAhead, placeOnSurface, screenDistance, sizeNote, nextDoor, throughDoor, tourLeaves, tourStep, turn, type Placement } from './layout';
	import { MUSEUM, artwork, search, sizeLabel, type Artwork, type Hall } from './museum';

	/* eslint-disable @typescript-eslint/no-explicit-any */

	const theme = createTheme({ colors: { panel: { fill: '#14161b', border: '#262a33' } } });
	const SHOWS = ['Monet', 'Hokusai', 'Flowers', 'Cats'];
	const START = { x: 0, z: 1.6, yaw: 0, pitch: 0 };

	// ——— The show: a search, its works, and which one you're looking at. The URL holds it
	// (?q=monet&art=135382), so a link, or the QR code, opens the same work on another device.
	// A long show runs on through doors into more halls (&hall=3), each always the same works.
	const params = new URLSearchParams(location.search);
	let query = $state('');
	let draft = $state('');
	let works = $state.raw<Artwork[]>([]);
	let hall = $state(1);
	let halls = $state(1);
	// Counts the shows, to rebuild the hall (and replay the works popping in) for each.
	let show = $state(0);
	let loading = $state(false);
	let selected = $state<number | null>(null);
	let tour = $state(false);

	const room = $derived(layoutGallery(works));
	// The show's name on the far wall: as big as fits the wall.
	const titleSize = $derived(Math.min(8, 76 / Math.max(6, query.length)));
	const subtitle = $derived(halls > 1 ? `Hall ${hall} of ${halls} · ${works.length} works from ${MUSEUM}, at true size` : `${works.length} works from ${MUSEUM}, at true size`);
	const current = $derived(selected === null ? null : (works[selected] ?? null));
	// The details panel keeps showing the last work while it slides away.
	let detail = $state.raw<Artwork | null>(null);
	$effect(() => {
		if (current) detail = current;
	});
	const detailHang = $derived(detail ? room.hangs[works.indexOf(detail)] : undefined);
	const detailNote = $derived(detail ? sizeNote(detail.measured, detailHang?.scale ?? 1) : '');

	type Open = {
		// A work to walk up to once the hall is built, or the first (1) or last (-1) on the tour.
		art?: number;
		pick?: 1 | -1;
		hall?: number;
		push?: boolean;
		instant?: boolean;
		// Going between halls: fade out, and come in at the door you went through (`end`: at
		// the far door, as through the one behind you), and fade back in.
		fade?: boolean;
		arrive?: 'start' | 'end';
	};
	// Halls of the current show, by number: the ones either side of where you are are fetched
	// ahead, so going through a door doesn't wait on the museum.
	let fetched = { query: '', halls: new Map<number, Promise<Hall>>() };
	function fetchHall(q: string, number: number): Promise<Hall> {
		if (fetched.query !== q.toLowerCase()) fetched = { query: q.toLowerCase(), halls: new Map() };
		const { halls: cache } = fetched;
		let found = cache.get(number);
		if (!found) {
			found = search(q, number);
			cache.set(number, found);
			found.catch(() => cache.delete(number));
		}
		return found;
	}

	let request: AbortController | undefined;
	async function open(text: string, options: Open = {}) {
		const q = text.trim();
		if (!q) return;
		request?.abort();
		const mine = (request = new AbortController());
		const number = Math.max(1, Math.floor(options.hall || 1));
		const fading = !!options.fade && !ar;
		loading = true;
		try {
			// The fade out runs while the museum answers.
			const [found] = await Promise.all([fetchHall(q, number), fading ? fadeTo(1) : undefined]);
			if (mine !== request) return;
			let list = found.works;
			// A link to a work this hall doesn't have (any more): it hangs here as well.
			if (options.art && !list.some((work) => work.id === options.art)) {
				const linked = await artwork(options.art, mine.signal).catch(() => null);
				if (linked) list = [...list, linked];
			}
			if (mine !== request) return;
			if (!list.length) {
				// A link to a hall past the end (the show has shrunk): its first hall instead.
				if (number > 1 && !works.length) return void open(q, { ...options, hall: 1 });
				toaster.warning(number > 1 ? 'That’s the end of this show' : `Nothing in the collection for “${q}”`);
				return;
			}
			query = draft = q;
			works = list;
			hall = found.hall;
			halls = found.halls;
			for (const near of [hall + 1, hall - 1]) if (near >= 1 && near <= halls) fetchHall(q, near).catch(() => {});
			show++;
			selected = null;
			// `room` is already this hall's. Back through a door: beside this hall's next door,
			// looking back down the hall.
			const door = nextDoor(room);
			const arrival = options.arrive === 'end' ? { x: door.x - DOOR_STEP, z: door.z, yaw: Math.PI, pitch: 0 } : START;
			moveCamera(arrival, options.instant || fading);
			lastDoor = 0;
			const index = list.findIndex((work) => work.id === options.art);
			const target = index >= 0 ? index : options.pick ? tourStep(list.length, null, options.pick) : null;
			if (options.push ?? true) syncUrl(true);
			else if (target === null) syncUrl();
			// Let the hall build before walking up to the work.
			if (target !== null) setTimeout(() => mine === request && select(target), 900);
		} catch (error) {
			if ((error as Error).name !== 'AbortError') toaster.negative('Couldn’t reach the museum. Check your connection.');
		} finally {
			if (mine === request) loading = false;
			if (fading && mine === request) fadeTo(0);
		}
	}

	// Through a door, or a step off the end of the tour: the next hall (1) or the one before (-1).
	function goHall(by: 1 | -1, options: Open = {}) {
		const to = hall + by;
		if (loading || to < 1 || to > halls) return;
		open(query, { hall: to, fade: true, ...options });
	}

	function syncUrl(push = false) {
		const url = new URL(location.href);
		url.searchParams.set('q', query);
		if (hall > 1) url.searchParams.set('hall', String(hall));
		else url.searchParams.delete('hall');
		if (current) url.searchParams.set('art', String(current.id));
		else url.searchParams.delete('art');
		if (url.href !== location.href) history[push ? 'pushState' : 'replaceState'](null, '', url);
	}
	function onpopstate() {
		const now = new URLSearchParams(location.search);
		open(now.get('q') ?? SHOWS[0], { art: Number(now.get('art')), hall: Number(now.get('hall')), push: false });
	}

	// Pick a work (or none). On a screen you walk up to it. In VR you jump there if it's far.
	function select(index: number | null) {
		selected = index;
		syncUrl();
		const hang = index === null ? undefined : room.hangs[index];
		if (!hang || ar) return;
		const eye = camera?.object3D.position.y ?? 1.6;
		// On a screen, stand where the whole work is in view (further back on an upright phone,
		// looking a little down, so the work sits above the panel at the bottom).
		const lens = scene?.camera;
		const wanted = lens && !xr.presenting ? screenDistance(hang, lens.fov, lens.aspect) : Math.abs(hang.x - hang.view.x);
		const distance = Math.min(wanted, room.width - 0.6);
		const x = hang.x - Math.sign(hang.x) * distance;
		moveCamera({ x, z: hang.view.z, yaw: (hang.view.yaw * Math.PI) / 180, pitch: Math.atan2(hang.y - eye, distance) - (narrow ? 0.13 : 0) });
	}
	function step(by: number) {
		if (loading) return;
		// Off the end of the tour: on into the next hall (or back to the last work of the one
		// before). Through a fade, starting from the entrance. In AR it just goes round.
		const leaves = ar ? 0 : tourLeaves(works.length, selected, by);
		if (leaves && hall + leaves >= 1 && hall + leaves <= halls) return goHall(leaves, { pick: leaves });
		// Along one wall and back along the other, so you don't turn round for every work.
		const next = tourStep(works.length, selected, by);
		if (next === null) return;
		select(next);
		// In AR, the work waiting in front of you changes with it.
		if (ar) hung = hung.map((item) => (item.floating ? { ...item, key: ++hungKeys, work: works[next] } : item));
	}

	// A tour walks from work to work by itself (on a screen: a headset is never moved for you).
	$effect(() => {
		if (!tour || xr.presenting) return;
		step(1);
		const timer = setInterval(() => step(1), 6500);
		return () => clearInterval(timer);
	});

	// ——— Moving. On a screen the camera glides: the rig carries it, and look-controls holds
	// where it looks. In a headset only the rig moves, at once (gliding there is queasy).
	let rig = $state<any>();
	let camera = $state<any>();
	let leftHand = $state<any>();
	let rightHand = $state<any>();
	const scene = $derived<any>(rig?.closest('a-scene'));

	type Pose = { x: number; z: number; yaw: number; pitch: number };
	let glide: { from: Pose; to: Pose; start: number; duration: number } | null = null;

	function cameraPose(): Pose {
		const position = camera.object3D.getWorldPosition(new THREE.Vector3());
		const look = camera.components['look-controls'];
		return { x: position.x, z: position.z, yaw: look.yawObject.rotation.y, pitch: look.pitchObject.rotation.x };
	}
	function placeCamera(pose: Pose, turnToo = true) {
		const now = camera.object3D.getWorldPosition(new THREE.Vector3());
		rig.object3D.position.x += pose.x - now.x;
		rig.object3D.position.z += pose.z - now.z;
		if (!turnToo) return;
		const look = camera.components['look-controls'];
		look.yawObject.rotation.y = pose.yaw;
		look.pitchObject.rotation.x = pose.pitch;
	}
	function moveCamera(to: Pose, instant = false) {
		if (!rig?.object3D || !camera?.components?.['look-controls']) return;
		// tap-to-move stops its own glide when something else moves you (as teleport does).
		rig.emit('teleported');
		if (xr.presenting) {
			const from = cameraPose();
			if (Math.hypot(to.x - from.x, to.z - from.z) > 1.2) placeCamera(to, false);
			return;
		}
		const from = cameraPose();
		const target = { ...to, yaw: from.yaw + turn(from.yaw, to.yaw) };
		if (instant) return placeCamera(target);
		const distance = Math.hypot(to.x - from.x, to.z - from.z);
		glide = { from, to: target, start: performance.now(), duration: Math.min(2400, 800 + distance * 150) };
	}
	// Per-frame code uses the kit's everyFrame: the page's requestAnimationFrame stops in a headset.
	$effect(() => {
		if (!scene) return;
		return everyFrame(scene, () => {
			stepFade();
			watchDoors();
			if (!glide) return;
			const t = Math.min(1, (performance.now() - glide.start) / glide.duration);
			const k = t * t * (3 - 2 * t);
			const { from, to } = glide;
			const mix = (a: number, b: number) => a + (b - a) * k;
			placeCamera({ x: mix(from.x, to.x), z: mix(from.z, to.z), yaw: mix(from.yaw, to.yaw), pitch: mix(from.pitch, to.pitch) });
			if (t >= 1) glide = null;
		});
	});

	// ——— Going between halls. A dark sphere round the camera fades in and out: in the scene,
	// so it covers a headset's view as well as a screen's (the HTML panels stay above it).
	let veil = $state<any>();
	let veiled = 0;
	let fade: { from: number; to: number; start: number; duration: number; done: () => void } | null = null;
	function setVeil(opacity: number) {
		veiled = opacity;
		const mesh = veil?.getObject3D('mesh');
		if (!mesh) return;
		mesh.material.opacity = opacity;
		// Drawn last, over everything, whatever is nearer.
		mesh.renderOrder = 10000;
		veil.object3D.visible = opacity > 0.001;
	}
	function fadeTo(to: number, duration = 380): Promise<void> {
		fade?.done();
		return new Promise((resolve) => {
			const done = () => {
				if (fade?.done !== done) return;
				setVeil(to);
				fade = null;
				resolve();
			};
			fade = { from: veiled, to, start: performance.now(), duration, done };
			// Frames stop in a hidden tab: don't wait on them for ever.
			setTimeout(done, duration + 250);
		});
	}
	function stepFade() {
		if (!fade) return;
		const t = Math.min(1, (performance.now() - fade.start) / fade.duration);
		setVeil(fade.from + (fade.to - fade.from) * t);
		if (t >= 1) fade.done();
	}

	// Walking (or teleporting) into a door goes through it. Only on the way in: standing in a
	// doorway after a failed trip doesn't try again every frame.
	const DOOR_STEP = 2;
	let lastDoor = 0;
	const at = new THREE.Vector3();
	function watchDoors() {
		if (ar || !works.length || !camera) return;
		camera.object3D.getWorldPosition(at);
		const way = throughDoor(room, at.x, at.z, { next: hall < halls, previous: hall > 1 });
		if (way && way !== lastDoor && !loading) goHall(way, { arrive: way > 0 ? 'start' : 'end' });
		lastDoor = way;
	}
	// Walking off yourself (tapping the floor, dragging the view) ends a glide, and the tour.
	const takeOver = () => {
		glide = null;
		tour = false;
	};

	// The first show, once the scene is there to walk into.
	let started = false;
	$effect(() => {
		if (!camera || started) return;
		started = true;
		const begin = () => open(params.get('q') ?? SHOWS[0], { art: Number(params.get('art')), hall: Number(params.get('hall')), push: false, instant: true });
		if (camera.hasLoaded) begin();
		else camera.addEventListener('loaded', begin, { once: true });
	});

	// ——— AR: your room instead of the hall. Each trigger pull (or tap, on a phone) on a real
	// wall hangs the current work there at its true size; on a table or the floor it stands.
	let ar = $state(false);
	let arSupported = $state(false);
	(navigator as any).xr?.isSessionSupported('immersive-ar').then((supported: boolean) => (arSupported = supported));
	// A wrist panel needs a controller to be on; without one (a phone) it follows your view.
	let controllers = $state(false);

	type Hung = { key: number; work: Artwork; position: string; rotation: string; floating: boolean };
	let hung = $state.raw<Hung[]>([]);
	let hungKeys = 0;
	const arWork = $derived(current ?? works[0]);

	function head() {
		const object = camera.object3D;
		const position = object.getWorldPosition(new THREE.Vector3());
		const yaw = new THREE.Euler().setFromQuaternion(object.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
		return { position, yaw };
	}
	function hang(place: Placement, floating = false) {
		if (!arWork) return;
		const { x, y, z } = place.position;
		// A work still waiting in the air goes to the new spot instead of staying behind.
		hung = [...hung.filter((item) => !item.floating), { key: ++hungKeys, work: arWork, position: `${x} ${y} ${z}`, rotation: `0 ${place.yaw} 0`, floating }];
	}
	function hangAhead(floating = false) {
		const { position, yaw } = head();
		hang(placeAhead(position, yaw), floating);
	}
	function undo() {
		hung = hung.slice(0, -1);
	}

	function onsession(event: Event) {
		const el = event.currentTarget as any;
		const now = !!el.xrSession && el.is('ar-mode');
		glide = null;
		tour = false;
		if (now === ar) return;
		ar = now;
		hung = [];
		// The headset's pose arrives with the session's first frames: then put the work in front of you.
		if (ar) setTimeout(() => ar && hangAhead(true), 600);
	}

	// The trigger both clicks the UI and hangs (ar-hit-test hears every press). A press that
	// starts or ends with that hand's laser on something clickable is a click.
	type InputSource = { handedness: 'left' | 'right' | 'none' };
	const pointing = (el: any) => !!el?.components?.raycaster?.intersections.length;
	function onUI(source: InputSource) {
		if (source.handedness === 'left') return pointing(leftHand);
		if (source.handedness === 'right') return pointing(rightHand);
		// A tap on a phone's screen: the kit's tap cursor (any raycaster that isn't a hand).
		return [...scene.querySelectorAll('[raycaster]')].some((el) => el !== leftHand && el !== rightHand && pointing(el));
	}
	const clicks = new WeakSet<InputSource>();
	type HitEvent = CustomEvent<{ inputSource: InputSource; position: any; orientation: any }>;
	function onselectstart(event: Event) {
		const { inputSource } = (event as HitEvent).detail;
		if (onUI(inputSource)) clicks.add(inputSource);
		else clicks.delete(inputSource);
	}
	function onhit(event: Event) {
		const { inputSource, position, orientation } = (event as HitEvent).detail;
		if (!ar || !arWork || clicks.has(inputSource) || onUI(inputSource)) return;
		const place = placeOnSurface({ position, orientation }, head().position, arWork.height);
		hang(place);
		toaster.positive(place.on !== 'wall' ? 'Placed. Aim at a wall to hang it' : arWork.measured ? `Hung at true size: ${sizeLabel(arWork)}` : 'Hung. Its real size is unknown');
	}

	// ——— Taking it home: AR here if this device can, or a QR code for one that can.
	let handoff = $state(false);
	// The link in the QR code, taken when it opens: the dialog's contents render once, at load.
	let handoffUrl = $state('');
	function shareUrl() {
		const url = new URL(location.href);
		// From the dev machine, a link another device can open (see vite.config.ts).
		if (['localhost', '127.0.0.1'].includes(url.hostname) && __LAN_HOST__) url.hostname = __LAN_HOST__;
		return url.href;
	}
	function hangAtHome() {
		if (xr.presenting) toaster.info('Leave VR, then press AR to hang it in your room');
		else if (arSupported) scene.enterAR();
		else {
			handoffUrl = shareUrl();
			handoff = true;
		}
	}
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl());
			toaster.positive('Link copied: it opens this work');
		} catch {
			toaster.info(shareUrl());
		}
	}

	// ——— Screen layout and keys.
	let innerWidth = $state(1024);
	const narrow = $derived(innerWidth < 720);
	// The Salon panel folds to its title bar; on a phone it starts folded, out of the view.
	let folded = $state(window.innerWidth < 720);
	const short = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
	const status = $derived(loading ? 'Asking the museum…' : works.length ? `${halls > 1 ? `Hall ${hall} of ${halls} · ` : ''}${works.length} works · ${MUSEUM} · CC0` : ' ');
	const help = $derived(
		xr.presenting
			? 'Left stick teleports · trigger picks a work · hold the right grip for another show'
			: narrow
				? 'Drag to look · tap the floor to walk · tap a work'
				: 'Click the floor to walk · click a work · ← → · hold E for another show',
	);
	const showItems = SHOWS.map((label) => ({ label }));

	function onkeydown(event: KeyboardEvent) {
		// Not while typing in an HTML field (a focused 3D Input keeps its keys to itself).
		if ((event.target as HTMLElement).closest?.('input, textarea') || event.metaKey || event.ctrlKey) return;
		if (event.key === 'ArrowRight') step(1);
		if (event.key === 'ArrowLeft') step(-1);
		if (event.repeat) return;
		if (event.key === 'Escape') select(null);
		if (event.key === 'v' || event.key === 'V') xr.simulated = !xr.simulated;
	}
</script>

<svelte:window {onkeydown} {onpopstate} bind:innerWidth />

<ThemeProvider {theme}>
	<!-- The <a-scene>. `xr-mode-ui` shows both buttons: VR walks the hall, AR hangs on your wall.
	     `ar-hit-test` finds real surfaces: hold the trigger to aim, release to hang. -->
	<Scene3D
		xr-mode-ui="XRMode: xr"
		webxr="optionalFeatures: hit-test, anchors"
		ar-hit-test="type: map; mapSize: 0.3 0.3"
		background="color: #0a0b0e"
		fog={ar ? undefined : 'type: exponential; color: #0a0b0e; density: 0.014'}
		device-orientation-permission-ui="enabled: false"
		onenter-vr={onsession}
		onexit-vr={onsession}
		onar-hit-test-select-start={onselectstart}
		onar-hit-test-select={onhit}
		onmousedown={(event: Event) => (event as CustomEvent).detail?.intersectedEl === null && takeOver()}
	>
		<a-entity light="type: ambient; intensity: 1.1"></a-entity>
		<a-entity light="type: directional; intensity: 1.4" position="1 4 2"></a-entity>

		{#if !ar}
			<!-- The hall: as long as the show needs. `floor` is what you can walk or teleport onto. -->
			{@const half = room.width / 2}
			{@const span = room.length + room.back}
			{@const middle = (room.back - room.length) / 2}
			<!-- A dark, slightly see-through floor over a mirrored copy of the works: a polished floor. -->
			<a-plane class="floor" rotation="-90 0 0" position="0 0 {middle}" width={room.width} height={span} material="color: #0b0c10; transparent: true; opacity: 0.84; roughness: 1"></a-plane>
			<a-plane position="{-half} {room.height / 2} {middle}" rotation="0 90 0" width={span} height={room.height} material="color: #1b1e25; roughness: 1"></a-plane>
			<a-plane position="{half} {room.height / 2} {middle}" rotation="0 -90 0" width={span} height={room.height} material="color: #1b1e25; roughness: 1"></a-plane>
			<a-plane position="0 {room.height / 2} {-room.length}" width={room.width} height={room.height} material="color: #1b1e25; roughness: 1"></a-plane>
			<a-plane position="0 {room.height / 2} {room.back}" rotation="0 180 0" width={room.width} height={room.height} material="color: #1b1e25; roughness: 1"></a-plane>
			<a-plane position="0 {room.height} {middle}" rotation="90 0 0" width={room.width} height={span} material="color: #101216; roughness: 1"></a-plane>
			<!-- A line of light where the walls meet the floor. -->
			<a-box position="{-half + 0.01} 0.012 {middle}" width="0.02" height="0.024" depth={span} material="shader: flat; color: #e8cf9c"></a-box>
			<a-box position="{half - 0.01} 0.012 {middle}" width="0.02" height="0.024" depth={span} material="shader: flat; color: #e8cf9c"></a-box>

			{#key show}
				<!-- The show's name on the far wall, in the kit's Text. -->
				<a-entity position="0 2.7 {-room.length + 0.03}">
					<a-entity scale="{titleSize} {titleSize} {titleSize}"><Text variant="HeadingMedium" text={query.toUpperCase()} /></a-entity>
					<a-entity position="0 {-titleSize * 0.085 - 0.2} 0" scale="2 2 2"><Text variant="LabelMedium" color="#8d93a0" text={subtitle} /></a-entity>
				</a-entity>
				<!-- Doors on to the rest of the show: on the right at the far end to the next hall, -->
				<!-- behind you to the last. -->
				{#if hall < halls}
					<Door position="{room.width / 2} 0 {nextDoor(room).z}" rotation="0 -90 0" label="Hall {hall + 1}" detail="of {halls}" onclick={() => goHall(1, { arrive: 'start' })} />
				{/if}
				{#if hall > 1}
					<Door position="0 0 {room.back}" rotation="0 180 0" label="Hall {hall - 1}" detail="back" onclick={() => goHall(-1, { arrive: 'end' })} />
				{/if}
				{#each room.hangs as hang, index (works[index].id)}
					<Hanging
						work={works[index]}
						width={hang.width}
						height={hang.height}
						position="{hang.x} {hang.y} {hang.z}"
						rotation="0 {hang.yaw} 0"
						selected={selected === index}
						note={sizeNote(works[index].measured, hang.scale)}
						delay={250 + index * 110}
						onclick={() => select(index)}
					/>
				{/each}
				<a-entity scale="1 -1 1">
					{#if hall < halls}<Door position="{room.width / 2} 0 {nextDoor(room).z}" rotation="0 -90 0" reflection />{/if}
					{#if hall > 1}<Door position="0 0 {room.back}" rotation="0 180 0" reflection />{/if}
					{#each room.hangs as hang, index (works[index].id)}
						<Hanging work={works[index]} width={hang.width} height={hang.height} position="{hang.x} {hang.y} {hang.z}" rotation="0 {hang.yaw} 0" note={sizeNote(works[index].measured, hang.scale)} delay={250 + index * 110} reflection />
					{/each}
				</a-entity>
			{/key}
		{:else}
			<!-- Your room. What you've hung, each at its real size. -->
			{#each hung as item (item.key)}
				<Hanging
					work={item.work}
					width={item.work.width}
					height={item.work.height}
					position={item.position}
					rotation={item.rotation}
					note={sizeNote(item.work.measured, 1)}
					halo={false}
					onclick={() => toaster.info(`${short(item.work.title, 40)} · ${sizeLabel(item.work)}`)}
				/>
			{/each}
		{/if}

		<!-- The rig moves you: tap or click the floor to walk there (tap-to-move), on a screen. -->
		<a-entity bind:this={rig} id="rig" position="{START.x} 0 {START.z}" tap-to-move="collisionEntities: .floor; enabled: {!xr.presenting}" ontapmove={takeOver}>
			<a-entity bind:this={camera} id="camera" camera="near: 0.05; far: 400" look-controls="magicWindowTrackingEnabled: false" wasd-controls="acceleration: 30" position="0 1.6 0">
				<!-- The fade between halls. -->
				<a-entity bind:this={veil} geometry="primitive: sphere; radius: 0.2; segmentsWidth: 12; segmentsHeight: 8" material="shader: flat; color: #0a0b0e; side: back; transparent: true; opacity: 0; depthTest: false; depthWrite: false; fog: false" visible="false"></a-entity>
			</a-entity>
			<!-- In a headset: lasers click, the left stick teleports (not in AR: your room stays put). -->
			<a-entity
				bind:this={leftHand}
				id="leftHand"
				laser-controls="hand: left"
				blink-controls={ar ? undefined : 'cameraRig: #rig; teleportOrigin: #camera; collisionEntities: .floor'}
				oncontrollerconnected={() => (controllers = true)}
			></a-entity>
			<a-entity bind:this={rightHand} id="rightHand" laser-controls="hand: right" oncontrollerconnected={() => (controllers = true)}>
				<!-- Hold the right grip, aim with the thumbstick, release: the hall rebuilds for that show. -->
				<RadialMenu dimension="3d" controller="#rightHand" hand="right" openOn="gripdown" closeOn="gripup" items={showItems} onselect={(item) => open(item.label ?? '')} />
			</a-entity>
		</a-entity>

		<!-- Search and the tour: HTML at the top left of a screen, on your left wrist in a headset. -->
		<!-- On a phone it steps aside while you look at a work. -->
		<Surface screen="top-left" vr={controllers ? 'hand' : 'follow'} hand="#leftHand" side={-0.62} distance={1} open={xr.immersive || !(narrow && current)}>
			{#if ar}
				<Panel title="Hang it here" width={292} padding={16} gap={12}>
					<Text variant="LabelMedium" align="left" maxWidth={260} text={arWork ? short(arWork.title, 60) : ''} />
					<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={260} text={arWork ? `${arWork.artist} · ${arWork.measured ? `${sizeLabel(arWork)}, true size` : 'size unknown, shown at a guess'}` : ''} />
					<Stack direction="row" gap={8} align="center">
						<Button label="‹" kind="secondary" size="compact" onclick={() => step(-1)} />
						<Button label="›" kind="secondary" size="compact" onclick={() => step(1)} />
						<Button label="Hang here" size="compact" onclick={() => hangAhead()} />
						<Button label="Undo" kind="secondary" size="compact" disabled={!hung.length} onclick={undo} />
					</Stack>
					<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={260} text="Hold the trigger on a wall and release to hang it there" />
				</Panel>
			{:else}
				<Panel title="Salon" width={328} padding={16} gap={12}>
					{#snippet action()}
						<Button label={folded ? '+' : '−'} kind="tertiary" size="mini" shape="round" aria-label={folded ? 'Show search' : 'Hide search'} aria-expanded={!folded} onclick={() => (folded = !folded)} />
					{/snippet}
					{#if folded}
						<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={260} text={status} />
					{:else}
						<!-- A native field on a screen; in a headset a 3D field, typed with the kit's <Keyboard>. -->
						<Input placeholder="Search the collection" enterkeyhint="search" maxLength={40} width={296} bind:value={draft} onsubmit={(value) => void open(value)} />
						<ButtonGroup size="compact" kind="secondary" gap={8}>
							{#each SHOWS as name (name)}
								<Button label={name} isSelected={query.toLowerCase() === name.toLowerCase()} onclick={() => open(name)} />
							{/each}
						</ButtonGroup>
						{#if loading}
							<ProgressBar infinite size="small" width={296} />
						{/if}
						<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={260} text={status} />
						<Stack direction="row" gap={8} align="center">
							<Button label="‹" kind="secondary" size="compact" onclick={() => step(-1)} />
							<Button label="›" kind="secondary" size="compact" onclick={() => step(1)} />
							<Checkbox type="toggle" label="Tour" bind:checked={tour} disabled={xr.presenting} />
						</Stack>
						<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={260} text={help} />
					{/if}
				</Panel>
			{/if}
		</Surface>

		<!-- The work you picked: HTML beside (or, on a phone, below) the view; beside you in a headset. -->
		<Surface screen={narrow ? 'bottom' : 'right'} vr="follow" side={0.62} height={-0.1} distance={1.1} open={!!current && !ar}>
			{#if detail}
				<Panel title={short(detail.title, 26)} width={300} padding={16} gap={10}>
					{#snippet action()}
						<Button label="×" kind="tertiary" size="mini" shape="round" onclick={() => select(null)} />
					{/snippet}
					<Text variant="LabelMedium" align="left" maxWidth={268} text={[detail.artist, detail.date].filter(Boolean).join(', ')} />
					<Text variant="LabelSmall" align="left" color="#8d93a0" maxWidth={268} text={detail.medium || detail.type} />
					<Stack direction="row" gap={6}>
						<!-- The museum's measurement, then how it's shown here: true size, or scaled to fit
						     the wall. With no measurement there is nothing to be true to. -->
						<Tag size="small" kind={detail.measured ? 'accent' : 'warning'} variant="light" label={sizeLabel(detail)} />
						<Tag size="small" label="CC0" />
						{#if detail.measured}
							<Tag size="small" kind={detailNote ? 'warning' : 'positive'} variant="light" label={detailNote ? `Shown at ${Math.round((detailHang?.scale ?? 1) * 100)}%` : 'True size'} />
						{/if}
					</Stack>
					<ButtonGroup size="compact" gap={8}>
						<Button label="Hang on my wall" onclick={hangAtHome} />
						<Button label="Copy link" kind="secondary" onclick={copyLink} />
					</ButtonGroup>
				</Panel>
			{/if}
		</Surface>

		<Surface screen={narrow ? 'bottom' : 'bottom-left'} vr="follow" side={0} height={-0.42} distance={1.2}>
			<Toaster placement="bottom-left" />
		</Surface>

		<!-- For typing a search in a headset: opens while the 3D field has focus. -->
		<Keyboard />
	</Scene3D>

	<!-- Desktop: hold E, aim with the mouse, release. HTML, outside the scene. -->
	<RadialMenu hotkey="e" items={showItems} onselect={(item) => open(item.label ?? '')} disabled={xr.presenting} />

	<!-- No AR on this device: hand the show to one that has it. The link opens this very work. -->
	<Modal bind:open={handoff} title="Hang it on your wall" width={340}>
		<div class="handoff">
			<Qr text={handoffUrl} />
			<Text align="center" maxWidth={292} color="#CBCBCB" text="Scan with a phone, or open the link in a headset. Then press AR: the work hangs on your wall at its real size." />
		</div>
		{#snippet actions()}
			<Button label="Copy link" kind="secondary" onclick={copyLink} />
			<Button label="Done" onclick={() => (handoff = false)} />
		{/snippet}
	</Modal>
</ThemeProvider>

<style>
	.handoff {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}
</style>
