<script lang="ts">
	// One work on a wall: the picture at its size in meters, a frame, a pool of light behind
	// it, and a label. `position` is the picture's center and `rotation` turns its face out.
	// Used for the gallery, for its reflection in the floor, and for your own wall in AR.
	import { RAYCASTABLE, Text } from '@gadxr/ui';
	import type { Artwork } from './museum';

	type Props = {
		work: Artwork;
		width: number;
		height: number;
		position: string;
		rotation: string;
		selected?: boolean;
		// Why it isn't at its true size ("Shown at 60% of its size", "Size unknown"), or ''.
		// Such a work gets corner marks instead of a frame, and the note on its label.
		note?: string;
		// The copy under the floor: just the frame and the picture.
		reflection?: boolean;
		halo?: boolean;
		// ms before it pops in.
		delay?: number;
		onclick?: () => void;
	};

	let { work, width, height, position, rotation, selected = false, note = '', reflection = false, halo = true, delay = 0, onclick }: Props = $props();

	let hovered = $state(false);
	// The frame's width grows a little with the picture.
	const border = $derived(Math.min(0.045, 0.014 + 0.02 * Math.max(width, height)));
	const frame = $derived(selected ? '#d9b871' : hovered ? '#8f7650' : '#4a3a28');
	// Corner marks, like a crop: an arm along each edge from each corner of the picture.
	const arm = $derived(Math.min(0.14, 0.28 * Math.min(width, height)));
	const mark = $derived(selected ? '#d9b871' : hovered ? '#c3ccd8' : '#8a94a3');
	const corners = [
		[-1, 1],
		[1, 1],
		[-1, -1],
		[1, -1],
	];
	const short = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
	const byline = $derived([work.artist, work.date].filter(Boolean).join(', '));
</script>

<a-entity {position} {rotation}>
	<a-entity scale="0.001 0.001 0.001" animation__in="property: scale; from: 0.001 0.001 0.001; to: 1 1 1; dur: 700; delay: {delay}; easing: easeOutBack">
		{#if halo && !reflection}
			<a-entity halo="opacity: {selected ? 0.8 : 0.55}" position="0 0 -0.037" scale="{width * 1.4 + 0.9} {height * 1.4 + 0.9} 1"></a-entity>
		{/if}
		{#if note}
			<!-- Not at its true size: no frame, a plain backing and marks at the corners. -->
			{@const x = width / 2 + border}
			{@const y = height / 2 + border}
			{@const thick = border * 0.4}
			<a-box position="0 0 -0.02" {width} {height} depth="0.038" material="color: #23262d; roughness: 0.9"></a-box>
			{#each corners as [sx, sy] (`${sx} ${sy}`)}
				<a-box position="{sx * (x - arm / 2)} {sy * y} -0.03" width={arm} height={thick} depth="0.018" material="shader: flat; color: {mark}"></a-box>
				<a-box position="{sx * x} {sy * (y - arm / 2)} -0.03" width={thick} height={arm} depth="0.018" material="shader: flat; color: {mark}"></a-box>
			{/each}
		{:else}
			<a-box position="0 0 -0.02" width={width + border * 2} height={height + border * 2} depth="0.038" material="color: {frame}; roughness: 0.5; metalness: 0.35"></a-box>
		{/if}
		<!-- The picture takes the clicks: `raycastable` goes on the entity that owns the mesh. -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_mouse_events_have_key_events -->
		<a-entity
			class={onclick && !reflection ? RAYCASTABLE : undefined}
			picture={work.image}
			scale="{width} {height} 1"
			{onclick}
			onmouseenter={() => (hovered = true)}
			onmouseleave={() => (hovered = false)}
		></a-entity>
		{#if !reflection}
			<!-- The label: the kit's Text, at a wall label's size (it's sized for panels). -->
			<a-entity position="{-width / 2 - border} {-height / 2 - border - 0.07} 0" scale="0.38 0.38 0.38">
				<Text variant="LabelMedium" align="left" text={short(work.title, 46)} />
				<Text variant="LabelSmall" align="left" color="#8d93a0" text={short(byline, 60)} position="0 -0.085 0" />
				{#if note}
					<Text variant="LabelSmall" align="left" color="#c9a45c" text={note} position="0 -0.16 0" />
				{/if}
			</a-entity>
		{/if}
	</a-entity>
</a-entity>
