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
import {
	type LaunchAgent,
	SMALLEST_APP_AVATAR,
} from "@workspace/ui/components/launch-loader"
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

const FLAT_TURN = /^(none|-?[\d.e-]+deg)$/

const SAMPLED_AT = [
	0, 80, 160, 240, 320, 400, 480, 560, 640, 800, 1000, 1300, 1700, 2200, 3000,
	4500, 7000,
]

const ancestryOf = (hexagon: HTMLElement, loader: HTMLElement) => {
	const ancestry: HTMLElement[] = []
	for (
		let element: HTMLElement | null = hexagon;
		element && element !== loader;
		element = element.parentElement
	)
		ancestry.push(element)
	return ancestry
}

const drawnWidthOf = (hexagon: HTMLElement, loader: HTMLElement) =>
	ancestryOf(hexagon, loader).reduce((width, element) => {
		const { scale } = getComputedStyle(element)
		return scale === "none" ? width : width * Number.parseFloat(scale)
	}, hexagon.offsetWidth)

const expectHexagonsKept = async (loader: HTMLElement) => {
	for (const hexagon of slotsIn(loader, "launch-loader-hexagon")) {
		await expect(drawnWidthOf(hexagon, loader)).toBeGreaterThanOrEqual(
			SMALLEST_APP_AVATAR,
		)
		for (const element of ancestryOf(hexagon, loader))
			await expect(getComputedStyle(element).rotate).toMatch(FLAT_TURN)
	}
}

const expectHexagonsKeptThroughout = async (loader: HTMLElement) => {
	const animations = loader.getAnimations({ subtree: true })
	for (const animation of animations) animation.pause()
	for (const time of SAMPLED_AT) {
		for (const animation of animations) animation.currentTime = time
		await expectHexagonsKept(loader)
	}
}

const expectAvatarHexagon = async (hexagon: HTMLElement, window: string) => {
	const field = slotIn(hexagon, "companion-field")
	const { backgroundColor, maskImage } = getComputedStyle(field)

	await expect(maskImage).toContain("data:image/svg+xml")
	await expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
	await expect(backgroundColor).not.toBe(window)
	await expect(slotsIn(hexagon, "outlined-hexagon-edge")).toHaveLength(2)
}

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
	for (const hexagon of slotsIn(loader, "launch-loader-hexagon"))
		await expectAvatarHexagon(hexagon, resolvedRootColor("--background"))
	await expectHexagonsKept(loader)

	return loader
}

const proves =
	(proof: Proof) =>
	async ({ canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		const loader = await expectStillImage(canvasElement, proof)

		await withMotionAllowed(async () => {
			await waitFor(() => expect(loader).not.toHaveAttribute("data-still"))
			const coloured = slotsIn(loader, "launch-loader-colour")
			await expect(coloured).toHaveLength(proof.coloured)
			for (const layer of coloured)
				await expect(slotsIn(layer, "bot-identity-avatar")).toHaveLength(1)

			const names = animationNamesIn(loader)
			await expect(names).toContain("ui-launch-arrive")
			await expect(names).toContain(proof.loop)

			const spans = exitSpansOf(loader)
			await expect(Math.min(...spans.map(({ start }) => start))).toBe(0)
			await expect(
				Math.max(...spans.map(({ end }) => end)),
			).toBeLessThanOrEqual(EXIT_BUDGET_SECONDS)

			await expectHexagonsKeptThroughout(loader)
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
		await Promise.all(
			loader
				.getAnimations({ subtree: true })
				.filter((animation) => animation instanceof CSSTransition)
				.map(({ finished }) => finished),
		)
		await expectHexagonsKept(loader)
	})
}

const SOLO_PROOF: Proof = {
	direction: "solo",
	hexagons: 1,
	coloured: 0,
	loop: "ui-launch-step",
}

const CLUSTER_PROOF: Proof = {
	direction: "cluster",
	hexagons: 3,
	coloured: 3,
	loop: "ui-launch-step",
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
		"One Kiroshi hexagon drawn like an agent avatar: the rounded hexagon cut, the ink field on its neutral ground, the glaze outline. Entrance: it settles in from 40 percent of its size, unwinding a third of a turn. Loop: every 1.3s it turns a sixth of a turn in its own plane and rests, so the outline lands on itself at every step. Exit: the window opens through it, the mark grows and fades in 300ms. Changed: the half flip is gone, it showed the cell edge-on.",
	),
	play: proves(SOLO_PROOF),
})

export const Cluster = meta.story({
	args: { direction: "cluster", agents: 3 },
	parameters: describedAs(
		"The three-cell Hive mark at launch size, each cell a full avatar hexagon: the first three agents, completed with ink cells when fewer are known. Entrance: the three cells fly in from outside at half size and dock. Loop: the trio hops a third of a turn every 1.5s, each cell staying upright. One cell at a time shows as its agent's own avatar, colour ground and colour field, for one hop. Exit: the trio folds to half size with a sixth of a turn and fades in 300ms. Changed: every cell now carries the cut, the ground and the outline, and the exit stops at half size.",
	),
	play: proves(CLUSTER_PROOF),
})

export const Ring = meta.story({
	args: { direction: "ring", agents: 8 },
	parameters: describedAs(
		"One avatar hexagon per agent on a circle, nothing in the centre, completed with ink cells under six agents so the ring stays a ring. Entrance: the ring fans open from the top, every cell upright and at full size, travelling along the circle to its place. Loop: a wave runs around the ring every 1.6s, lifting each cell outward and swelling it, never dimming it. Once per lap the cell under the wave shows as its agent's avatar in colour. Exit: the ring opens up with a twelfth of a turn and fades in 300ms. Changed: the ring is wider so twelve cells stay 21px, and the burst from the centre, the dimmed tail and the collapse are gone, each one shrank or faded the hexagons.",
	),
	play: proves(RING_PROOF),
})

export const Hive = meta.story({
	args: { direction: "hive", agents: 7 },
	parameters: describedAs(
		"A honeycomb of avatar hexagons, one cell per agent, filled in a spiral from the centre and completed with ink cells under seven agents so the flower is always whole. Entrance: the cells grow out of the centre one after the other, never under two thirds of their size. Loop: a ripple leaves the centre every 2.4s and shrinks each ring to 72 percent and back, at full opacity. After each ripple one cell comes back as its agent's avatar in colour, and the next ripple washes it out. Exit: the comb bursts apart, cells keeping their size, and fades in 300ms. Changed: cells no longer grow from nothing, the ripple no longer dims them, the exit no longer shrinks them.",
	),
	play: proves(HIVE_PROOF),
})

export const Orbit = meta.story({
	args: { direction: "orbit", agents: 5 },
	parameters: describedAs(
		"The Kiroshi hexagon in the centre, one 20px avatar hexagon per agent on three lanes, the outer lanes slower, never fewer than three satellites. Entrance: the core settles in from half its size, then the satellites slide out from behind it at full size. Loop: every lane turns at its own steady pace, so the picture never repeats on the eye. One satellite at a time shows as its agent's avatar in colour for 2s. Exit: the satellites slide back behind the core, which opens and fades, 400ms in all. Changed: satellites went from 16 to 20px so they take the same glaze outline as the larger avatars, and they no longer grow from nothing or shrink to nothing.",
	),
	play: proves(ORBIT_PROOF),
})

export const ClusterFirstLaunch = meta.story({
	args: { direction: "cluster", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: the same trio, three ink hexagons with their cut, ground and outline, no colour at any moment.",
	),
	play: proves({
		direction: "cluster",
		hexagons: 3,
		coloured: 0,
		loop: "ui-launch-step",
	}),
})

export const RingFirstLaunch = meta.story({
	args: { direction: "ring", agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: a ring of six ink hexagons with their cut, ground and outline, the wave with no colour at any moment.",
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
		"The first launch, no agent known: a full flower of seven ink hexagons with their cut, ground and outline, the ripple with no colour at any moment.",
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
		"The first launch, no agent known: the core and three ink satellites, one per lane, each a hexagon with its cut, ground and outline, no colour at any moment.",
	),
	play: proves({
		direction: "orbit",
		hexagons: 4,
		coloured: 0,
		loop: "ui-launch-turn",
	}),
})

const STILL =
	"What a reader who asks for reduced motion gets: one still image, every cell a whole avatar hexagon at rest in ink, with the status written under it since nothing moves to say the app is starting. The exit is a plain 150ms fade."

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
