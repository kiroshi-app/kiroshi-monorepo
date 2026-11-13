import { useState } from "react"
import { expect, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	expectCellsIn,
	expectCentredInWindow,
	isInBrowserRunner,
	resolvedRootColor,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import type { LaunchAgent } from "@workspace/ui/components/launch-loader"
import { LaunchLoaderCluster } from "@workspace/ui/components/launch-loader-cluster"
import { LaunchLoaderHive } from "@workspace/ui/components/launch-loader-hive"
import { LaunchLoaderOrbit } from "@workspace/ui/components/launch-loader-orbit"
import { LaunchLoaderRing } from "@workspace/ui/components/launch-loader-ring"
import { LaunchLoaderSolo } from "@workspace/ui/components/launch-loader-solo"

const AGENTS: LaunchAgent[] = [
	{ id: "atlas", name: "Atlas", hue: 220 },
	{ id: "juniper", name: "Juniper", hue: 150 },
	{ id: "marlow", name: "Marlow", hue: 20 },
	{ id: "odile", name: "Odile", hue: 320 },
	{ id: "sable", name: "Sable", hue: 257 },
	{ id: "thea", name: "Thea", hue: 80 },
	{ id: "corin", name: "Corin", hue: 190 },
	{ id: "wren", name: "Wren", hue: 350 },
	{ id: "ines", name: "Ines", hue: 120 },
	{ id: "halden", name: "Halden", hue: 290 },
	{ id: "pax", name: "Pax", hue: 45 },
	{ id: "lumen", name: "Lumen", hue: 240 },
]

const LOADERS = {
	solo: LaunchLoaderSolo,
	cluster: LaunchLoaderCluster,
	ring: LaunchLoaderRing,
	hive: LaunchLoaderHive,
	orbit: LaunchLoaderOrbit,
}

type Direction = keyof typeof LOADERS

type LoaderStageProps = {
	direction: Direction
	agents: number
	exit: boolean
	replay: boolean
	isStill?: boolean
}

type Run = Pick<LoaderStageProps, "exit" | "replay"> & { count: number }

const useRunCount = ({ exit, replay }: Pick<Run, "exit" | "replay">) => {
	const [run, setRun] = useState<Run>({ exit, replay, count: 0 })
	if (run.exit !== exit || run.replay !== replay) {
		const startsOver = run.replay !== replay || (run.exit && !exit)
		setRun({ exit, replay, count: run.count + (startsOver ? 1 : 0) })
	}
	return run.count
}

const LoaderStage = ({
	direction,
	agents,
	exit,
	replay,
	isStill,
}: LoaderStageProps) => {
	const run = useRunCount({ exit, replay })
	const Loader = LOADERS[direction]

	return (
		<Loader
			agents={AGENTS.slice(0, agents)}
			isLeaving={exit}
			isStill={isStill}
			key={run}
		/>
	)
}

type SchemeContext = { globals: { theme?: string } }

const schemeBeforeMount = ({ globals }: SchemeContext) => {
	const isDark = globals.theme === "dark"
	document.documentElement.classList.toggle("dark", isDark)
	return () => document.documentElement.classList.remove("dark")
}

const EXIT_BUDGET_SECONDS = 0.5

const secondsIn = (list: string) =>
	list.split(",").map((value) => Number.parseFloat(value))

const exitSpansOf = (loader: HTMLElement) =>
	[loader, ...loader.querySelectorAll("*")].flatMap((element) => {
		const { transitionDelay, transitionDuration } = getComputedStyle(element)
		const delays = secondsIn(transitionDelay)
		return secondsIn(transitionDuration)
			.map((duration, index) => {
				const start = delays[index % delays.length]
				return { start, end: start + duration }
			})
			.filter(({ start, end }) => end > start)
	})

const animationNamesIn = (loader: HTMLElement) =>
	new Set(
		loader
			.getAnimations({ subtree: true })
			.filter((animation) => animation instanceof CSSAnimation)
			.map(({ animationName }) => animationName),
	)

type Proof = {
	direction: Direction
	hexagons: number
	coloured: number
	loop: string
}

type PlayContext = { canvasElement: HTMLElement }

const expectStillImage = async (
	canvasElement: HTMLElement,
	{ direction, hexagons }: Proof,
) => {
	const loader = slotIn(canvasElement, "launch-loader")
	const content = slotIn(loader, "full-window-content")
	const stage = slotIn(loader, "launch-loader-stage")

	await expect(loader.dataset.direction).toBe(direction)
	await expect(loader.clientHeight).toBe(window.innerHeight)
	await expect(getComputedStyle(loader).backgroundColor).toBe(
		resolvedRootColor("--background"),
	)
	await expect(loader.children).toHaveLength(1)
	await expect(content.children).toHaveLength(2)
	await expectCentredInWindow(canvasElement)
	await expect(stage).toHaveAttribute("aria-hidden", "true")
	await expect(content.lastElementChild).toHaveTextContent("Starting Kiroshi")

	await expect(loader).toHaveAttribute("data-still")
	await expect(slotsIn(loader, "launch-loader-hexagon")).toHaveLength(hexagons)
	await expect(slotsIn(loader, "launch-loader-colour")).toHaveLength(0)
	await expect(loader.getAnimations({ subtree: true })).toHaveLength(0)
	for (const canvas of stage.querySelectorAll("canvas"))
		await expectCellsIn(canvas, "var(--foreground)")

	return loader
}

const proves =
	(proof: Proof) =>
	async ({ canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		const loader = await expectStillImage(canvasElement, proof)

		await withMotionAllowed(async () => {
			await waitFor(() => expect(loader).not.toHaveAttribute("data-still"))
			await expect(slotsIn(loader, "launch-loader-colour")).toHaveLength(
				proof.coloured,
			)

			const names = animationNamesIn(loader)
			await expect(names).toContain("ui-launch-arrive")
			await expect(names).toContain(proof.loop)

			const spans = exitSpansOf(loader)
			await expect(Math.min(...spans.map(({ start }) => start))).toBe(0)
			await expect(
				Math.max(...spans.map(({ end }) => end)),
			).toBeLessThanOrEqual(EXIT_BUDGET_SECONDS)
		})
	}

const provesHeldStill =
	(proof: Proof) =>
	async ({ canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		await expectStillImage(canvasElement, proof)

		await withMotionAllowed(async () => {
			await expectStillImage(canvasElement, proof)
		})
	}

const provesGone = async ({ canvasElement }: PlayContext) => {
	if (!isInBrowserRunner()) return
	const loader = slotIn(canvasElement, "launch-loader")

	await expect(loader.dataset.phase).toBe("leaving")
	await waitFor(() =>
		expect(
			getComputedStyle(slotIn(loader, "full-window-content")).opacity,
		).toBe("0"),
	)

	await withMotionAllowed(async () => {
		await waitFor(() => expect(loader).not.toHaveAttribute("data-still"))
		await waitFor(() =>
			expect(
				slotsIn(loader, "launch-loader-hexagon").every(
					(hexagon) => !hexagon.checkVisibility({ opacityProperty: true }),
				),
			).toBe(true),
		)
	})
}

const SOLO_PROOF: Proof = {
	direction: "solo",
	hexagons: 1,
	coloured: 0,
	loop: "ui-launch-flip",
}

const CLUSTER_PROOF: Proof = {
	direction: "cluster",
	hexagons: 3,
	coloured: 3,
	loop: "ui-launch-hop",
}

const RING_PROOF: Proof = {
	direction: "ring",
	hexagons: 8,
	coloured: 8,
	loop: "ui-launch-pulse",
}

const HIVE_PROOF: Proof = {
	direction: "hive",
	hexagons: 7,
	coloured: 7,
	loop: "ui-launch-pulse",
}

const ORBIT_PROOF: Proof = {
	direction: "orbit",
	hexagons: 6,
	coloured: 5,
	loop: "ui-launch-turn",
}

const describedAs = (story: string) => ({ docs: { description: { story } } })

const meta = preview.meta({
	title: "Explorations/Launch loader",
	component: LoaderStage,
	tags: ["!autodocs"],
	parameters: { layout: "fullscreen" },
	beforeEach: schemeBeforeMount,
	args: { agents: 5, exit: false, replay: false },
	argTypes: {
		direction: { table: { disable: true } },
		isStill: { table: { disable: true } },
		agents: {
			control: { type: "range", min: 0, max: 12, step: 1 },
			description:
				"How many agents the app knows at launch. 0 is the first launch: no agent known, ink only.",
		},
		exit: {
			control: "boolean",
			description:
				"Turn on to trigger the exit, at any moment of the entrance or the loop. Turn off to play again from the entrance.",
		},
		replay: {
			control: "boolean",
			description: "Flip either way to replay from the entrance.",
		},
	},
})

export const Solo = meta.story({
	args: { direction: "solo" },
	argTypes: { agents: { table: { disable: true } } },
	parameters: describedAs(
		"One Kiroshi hexagon, ink only. Entrance: it drops in from a third of its size, unwinding a third of a turn, and settles with a slight overshoot. Loop: a half flip around its vertical axis every 1.3s, resting flat between two flips. Exit: the window opens through it, the mark grows and fades in 300ms.",
	),
	play: proves(SOLO_PROOF),
})

export const Cluster = meta.story({
	args: { direction: "cluster", agents: 3 },
	parameters: describedAs(
		"The three-cell Hive mark, grown to launch size: the first three agents, completed with ink cells when fewer are known. Entrance: the three cells fly in from outside and dock. Loop: the trio hops a third of a turn every 1.5s, each cell staying upright. One cell at a time takes its agent colour for one hop. Exit: the trio folds into its centre and fades in 300ms.",
	),
	play: proves(CLUSTER_PROOF),
})

export const Ring = meta.story({
	args: { direction: "ring", agents: 8 },
	parameters: describedAs(
		"One hexagon per agent on a circle, nothing in the centre, completed with ink cells under six agents so the ring stays a ring. Entrance: the cells burst from the centre to their place, clockwise, while the ring swirls a quarter turn. Loop: a comet runs around the ring every 1.6s, its head at full ink, its tail fading. Once per lap one cell is lit in its agent colour as the head passes it. Exit: the ring collapses into its centre with a quarter turn and fades in 300ms.",
	),
	play: proves(RING_PROOF),
})

export const Hive = meta.story({
	args: { direction: "hive", agents: 7 },
	parameters: describedAs(
		"A honeycomb, one cell per agent, filled in a spiral from the centre and completed with ink cells under seven agents so the flower is always whole. Entrance: the cells grow out of the centre one after the other. Loop: a ripple leaves the centre every 2.4s and dips each ring in turn. After each ripple one cell comes back in its agent colour, and the next ripple washes it out. Exit: the comb bursts apart and fades in 300ms.",
	),
	play: proves(HIVE_PROOF),
})

export const Orbit = meta.story({
	args: { direction: "orbit", agents: 5 },
	parameters: describedAs(
		"The Kiroshi hexagon in the centre, one small satellite per agent on three lanes, the outer lanes slower, never fewer than three satellites. Entrance: the core settles in, then the satellites spiral out of it. Loop: every lane turns at its own steady pace, so the picture never repeats on the eye. One satellite at a time takes its agent colour for 2s. Exit: the satellites fall back into the core, which opens and fades, 400ms in all.",
	),
	play: proves(ORBIT_PROOF),
})

export const ClusterFirstLaunch = meta.story({
	args: { direction: "cluster", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: the same trio, three ink cells, no colour at any moment.",
	),
	play: proves({
		direction: "cluster",
		hexagons: 3,
		coloured: 0,
		loop: "ui-launch-hop",
	}),
})

export const RingFirstLaunch = meta.story({
	args: { direction: "ring", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: a ring of six ink cells, the comet with no colour at any moment.",
	),
	play: proves({
		direction: "ring",
		hexagons: 6,
		coloured: 0,
		loop: "ui-launch-pulse",
	}),
})

export const HiveFirstLaunch = meta.story({
	args: { direction: "hive", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: a full flower of seven ink cells, the ripple with no colour at any moment.",
	),
	play: proves({
		direction: "hive",
		hexagons: 7,
		coloured: 0,
		loop: "ui-launch-pulse",
	}),
})

export const OrbitFirstLaunch = meta.story({
	args: { direction: "orbit", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: the core and three ink satellites, one per lane, no colour at any moment.",
	),
	play: proves({
		direction: "orbit",
		hexagons: 4,
		coloured: 0,
		loop: "ui-launch-turn",
	}),
})

const STILL =
	"What a reader who asks for reduced motion gets: one still image, every cell at rest in ink, with the status written under it since nothing moves to say the app is starting. The exit is a plain 150ms fade."

export const SoloStill = Solo.extend({
	args: { isStill: true },
	parameters: describedAs(STILL),
	play: provesHeldStill(SOLO_PROOF),
})

export const ClusterStill = Cluster.extend({
	args: { isStill: true },
	parameters: describedAs(STILL),
	play: provesHeldStill(CLUSTER_PROOF),
})

export const RingStill = Ring.extend({
	args: { isStill: true },
	parameters: describedAs(STILL),
	play: provesHeldStill(RING_PROOF),
})

export const HiveStill = Hive.extend({
	args: { isStill: true },
	parameters: describedAs(STILL),
	play: provesHeldStill(HIVE_PROOF),
})

export const OrbitStill = Orbit.extend({
	args: { isStill: true },
	parameters: describedAs(STILL),
	play: provesHeldStill(ORBIT_PROOF),
})

export const SoloDark = Solo.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
})

export const ClusterDark = Cluster.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
})

export const RingDark = Ring.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
})

export const HiveDark = Hive.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
})

export const OrbitDark = Orbit.extend({
	tags: ["test-only"],
	globals: { theme: "dark" },
})

export const SoloGone = Solo.extend({
	tags: ["test-only"],
	args: { exit: true },
	play: provesGone,
})

export const ClusterGone = Cluster.extend({
	tags: ["test-only"],
	args: { exit: true },
	play: provesGone,
})

export const RingGone = Ring.extend({
	tags: ["test-only"],
	args: { exit: true },
	play: provesGone,
})

export const HiveGone = Hive.extend({
	tags: ["test-only"],
	args: { exit: true },
	play: provesGone,
})

export const OrbitGone = Orbit.extend({
	tags: ["test-only"],
	args: { exit: true },
	play: provesGone,
})
