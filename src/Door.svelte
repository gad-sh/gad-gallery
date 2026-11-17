<script lang="ts">
	// A doorway in an end wall, to another hall of the same show: a dark opening with warm
	// light spilling through it along the floor, a lit frame, and the hall's number over it.
	// `position` is the middle of its threshold, on the wall; `rotation` turns it into the room.
	// Walking (or teleporting) into it goes through; so does clicking or tapping it.
	import { RAYCASTABLE, Text } from '@xr-kit/ui';
	import { DOOR } from './layout';

	type Props = {
		position: string;
		rotation?: string;
		// "Hall 3", and what's beyond: "of 43", "back".
		label?: string;
		detail?: string;
		// The copy under the floor: no label, no clicks.
		reflection?: boolean;
		onclick?: () => void;
	};

	let { position, rotation = '0 0 0', label = '', detail = '', reflection = false, onclick }: Props = $props();

	let hovered = $state(false);
	const { width, height } = DOOR;
	const edge = 0.06;
	const lit = $derived(hovered ? '#ffe2a8' : '#e8cf9c');
</script>

<a-entity {position} {rotation}>
	<!-- The opening: darker than the wall, so it reads as a way through. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_mouse_events_have_key_events -->
	<a-plane
		class={onclick && !reflection ? RAYCASTABLE : undefined}
		position="0 {height / 2} 0.005"
		{width}
		{height}
		material="shader: flat; color: {hovered ? '#0c0d10' : '#050608'}"
		{onclick}
		onmouseenter={() => (hovered = true)}
		onmouseleave={() => (hovered = false)}
	></a-plane>
	<!-- Light from the next hall, pooling at the bottom of the opening. -->
	<a-entity halo="opacity: {hovered ? 0.75 : 0.5}" position="0 0.05 0.01" scale="{width * 1.05} {height * 0.9} 1"></a-entity>
	<!-- The frame: two jambs and a lintel, lit like the strips along the floor. -->
	<a-box position="{-width / 2 - edge / 2} {height / 2} 0.02" width={edge} {height} depth="0.04" material="shader: flat; color: {lit}"></a-box>
	<a-box position="{width / 2 + edge / 2} {height / 2} 0.02" width={edge} {height} depth="0.04" material="shader: flat; color: {lit}"></a-box>
	<a-box position="0 {height + edge / 2} 0.02" width={width + edge * 2} height={edge} depth="0.04" material="shader: flat; color: {lit}"></a-box>
	{#if !reflection && label}
		<a-entity position="0 {height + 0.36} 0.03" scale="2.3 2.3 2.3">
			<Text variant="LabelMedium" color="#e8cf9c" text={label.toUpperCase()} />
		</a-entity>
		{#if detail}
			<a-entity position="0 {height + 0.16} 0.03" scale="1.8 1.8 1.8">
				<Text variant="LabelSmall" color="#8d93a0" text={detail} />
			</a-entity>
		{/if}
	{/if}
</a-entity>
