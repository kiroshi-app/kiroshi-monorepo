import { useEffect, useState } from "react"
import { expect, fn, mocked, waitFor } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	centredInWindowOf,
	expectCellsIn,
	expectCentredInWindow,
	isInBrowserRunner,
	resolvedRootColor,
	slotIn,
	slotsIn,
	withMotionAllowed,
} from "@workspace/storybook/story-utils"
import {
	type AppBootAgent,
	AppBootScreen,
} from "@workspace/ui/components/app-boot-screen"

const AGENTS: AppBootAgent[] = [
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

type BootRunProps = {
	agents: number
	exit: boolean
	exitsAfter?: number
	onExitComplete: () => void
}

type BootStageProps = BootRunProps & { replay: boolean }

type Run = Pick<BootStageProps, "exit" | "replay"> & { count: number }

const useRunCount = ({ exit, replay }: Pick<Run, "exit" | "replay">) => {
	const [run, setRun] = useState<Run>({ exit, replay, count: 0 })
	if (run.exit !== exit || run.replay !== replay) {
		const startsOver = run.replay !== replay || (run.exit && !exit)
		setRun({ exit, replay, count: run.count + (startsOver ? 1 : 0) })
	}
	return run.count
}

const BootRun = ({
	agents,
	exit,
	exitsAfter,
	onExitComplete,
}: BootRunProps) => {
	const [hasWaited, setHasWaited] = useState(false)

	useEffect(() => {
		if (exitsAfter === undefined) return
		const wait = setTimeout(() => setHasWaited(true), exitsAfter)
		return () => clearTimeout(wait)
	}, [exitsAfter])

	return (
		<AppBootScreen
			agents={AGENTS.slice(0, agents)}
			data-tauri-drag-region="deep"
			isExiting={exit || hasWaited}
			onExitComplete={onExitComplete}
		/>
	)
}

const BootStage = ({ replay, ...run }: BootStageProps) => (
	<BootRun key={useRunCount({ exit: run.exit, replay })} {...run} />
)

type SchemeContext = { globals: { theme?: string } }

const schemeBeforeMount = ({ globals }: SchemeContext) => {
	const isDark = globals.theme === "dark"
	document.documentElement.classList.toggle("dark", isDark)
	return () => document.documentElement.classList.remove("dark")
}

const CLUSTER_CELLS = 3
const SMALLEST_APP_AVATAR = 16
const EXIT_BUDGET_SECONDS = 0.5
const ENTRANCE_SEEN_AFTER = 1600
const EXIT_REPORTED_WITHIN = { timeout: 5000 }

const secondsIn = (list: string) =>
	list.split(",").map((value) => Number.parseFloat(value))

const exitSpansOf = (screen: HTMLElement) =>
	[screen, ...screen.querySelectorAll("*")].flatMap((element) => {
		const { transitionDelay, transitionDuration } = getComputedStyle(element)
		const delays = secondsIn(transitionDelay)
		return secondsIn(transitionDuration)
			.map((duration, index) => {
				const start = delays[index % delays.length]
				return { start, end: start + duration }
			})
			.filter(({ start, end }) => end > start)
	})

const animationNamesIn = (screen: HTMLElement) =>
	new Set(
		screen
			.getAnimations({ subtree: true })
			.filter((animation) => animation instanceof CSSAnimation)
			.map(({ animationName }) => animationName),
	)

const FLAT_TURN = /^(none|-?[\d.e-]+deg)$/

const SAMPLED_AT = [
	0, 80, 160, 240, 320, 400, 480, 560, 640, 800, 1000, 1300, 1700, 2200, 3000,
	4500, 7000,
]

const ancestryOf = (hexagon: HTMLElement, screen: HTMLElement) => {
	const ancestry: HTMLElement[] = []
	for (
		let element: HTMLElement | null = hexagon;
		element && element !== screen;
		element = element.parentElement
	)
		ancestry.push(element)
	return ancestry
}

const drawnWidthOf = (hexagon: HTMLElement, screen: HTMLElement) =>
	ancestryOf(hexagon, screen).reduce((width, element) => {
		const { scale } = getComputedStyle(element)
		return scale === "none" ? width : width * Number.parseFloat(scale)
	}, hexagon.offsetWidth)

const expectHexagonsKept = async (screen: HTMLElement) => {
	for (const hexagon of slotsIn(screen, "app-boot-hexagon")) {
		await expect(drawnWidthOf(hexagon, screen)).toBeGreaterThanOrEqual(
			SMALLEST_APP_AVATAR,
		)
		for (const element of ancestryOf(hexagon, screen))
			await expect(getComputedStyle(element).rotate).toMatch(FLAT_TURN)
	}
}

const expectHexagonsKeptThroughout = async (screen: HTMLElement) => {
	const animations = screen.getAnimations({ subtree: true })
	for (const animation of animations) animation.pause()
	for (const time of SAMPLED_AT) {
		for (const animation of animations) animation.currentTime = time
		await expectHexagonsKept(screen)
	}
}

const expectAvatarHexagon = async (hexagon: HTMLElement, ground: string) => {
	const field = slotIn(hexagon, "companion-field")
	const { backgroundColor, maskImage } = getComputedStyle(field)

	await expect(maskImage).toContain("data:image/svg+xml")
	await expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
	await expect(backgroundColor).not.toBe(ground)
	await expect(slotsIn(hexagon, "outlined-hexagon-edge")).toHaveLength(2)
}

const statusOf = (screen: HTMLElement) => {
	const status = screen.querySelector<HTMLElement>('[role="status"]')
	if (!status) throw new Error("This screen announces no status")
	return status
}

const shownHexagonsOf = (screen: HTMLElement) =>
	slotsIn(screen, "app-boot-hexagon").filter((hexagon) =>
		hexagon.checkVisibility({ opacityProperty: true }),
	)

type PlayContext = { canvasElement: HTMLElement }

const expectStillImage = async (canvasElement: HTMLElement) => {
	const screen = slotIn(canvasElement, "app-boot-screen")
	const content = slotIn(screen, "full-window-content")
	const stage = slotIn(screen, "app-boot-stage")
	const ground = resolvedRootColor("--background")

	await expect(screen).toHaveAttribute("data-tauri-drag-region", "deep")
	await expect(screen.clientHeight).toBe(window.innerHeight)
	await expect(getComputedStyle(screen).backgroundColor).toBe(ground)
	await expect(screen.children).toHaveLength(1)
	await expect(content.children).toHaveLength(2)
	await expectCentredInWindow(canvasElement)
	await expect(stage).toHaveAttribute("aria-hidden", "true")
	await expect(statusOf(screen)).toBeVisible()
	await expect(statusOf(screen)).toHaveTextContent("Starting Kiroshi")

	await expect(screen).toHaveAttribute("data-still")
	await expect(slotsIn(screen, "app-boot-hexagon")).toHaveLength(CLUSTER_CELLS)
	await expect(slotsIn(screen, "app-boot-colour")).toHaveLength(0)
	await expect(screen.getAnimations({ subtree: true })).toHaveLength(0)
	for (const canvas of stage.querySelectorAll("canvas"))
		await expectCellsIn(canvas, "var(--foreground)")
	for (const hexagon of slotsIn(screen, "app-boot-hexagon"))
		await expectAvatarHexagon(hexagon, ground)
	await expectHexagonsKept(screen)

	return screen
}

const provesStill = async ({ canvasElement }: PlayContext) => {
	if (!isInBrowserRunner()) return
	await expectStillImage(canvasElement)
}

const provesRunning =
	(coloured: number) =>
	async ({ canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		const screen = await expectStillImage(canvasElement)

		await withMotionAllowed(async () => {
			await waitFor(() => expect(screen).not.toHaveAttribute("data-still"))
			await expect(screen.dataset.phase).toBe("running")
			await expect(statusOf(screen)).toHaveTextContent("Starting Kiroshi")
			await expect(statusOf(screen)).toHaveClass("sr-only")

			const colourLayers = slotsIn(screen, "app-boot-colour")
			await expect(colourLayers).toHaveLength(coloured)
			for (const layer of colourLayers)
				await expect(slotsIn(layer, "bot-identity-avatar")).toHaveLength(1)

			const names = animationNamesIn(screen)
			await expect(names).toContain("ui-launch-arrive")
			await expect(names).toContain("ui-launch-step")

			const spans = exitSpansOf(screen)
			await expect(Math.min(...spans.map(({ start }) => start))).toBe(0)
			await expect(
				Math.max(...spans.map(({ end }) => end)),
			).toBeLessThanOrEqual(EXIT_BUDGET_SECONDS)

			await expectHexagonsKeptThroughout(screen)
		})
	}

type ExitContext = PlayContext & { args: Pick<BootRunProps, "onExitComplete"> }

const expectExitReportedOnce = async ({ args, canvasElement }: ExitContext) => {
	const screen = slotIn(canvasElement, "app-boot-screen")
	const shownAtEachReport: number[] = []
	mocked(args.onExitComplete).mockImplementation(() => {
		shownAtEachReport.push(shownHexagonsOf(screen).length)
	})

	await waitFor(
		() => expect(shownAtEachReport).toEqual([0]),
		EXIT_REPORTED_WITHIN,
	)
	await expect(screen.dataset.phase).toBe("leaving")
	await expect(args.onExitComplete).toHaveBeenCalledOnce()

	return screen
}

const provesExit = async (context: ExitContext) => {
	if (!isInBrowserRunner()) {
		await expectExitReportedOnce(context)
		return
	}

	await withMotionAllowed(async () => {
		const screen = await expectExitReportedOnce(context)
		const stage = getComputedStyle(slotIn(screen, "app-boot-stage"))

		await expect(screen).not.toHaveAttribute("data-still")
		await expect(stage.opacity).toBe("0")
		await expect(stage.scale).toBe("0.5")
		await expect(stage.rotate).toBe("60deg")
		await expectHexagonsKept(screen)
	})
}

const provesStillExit = async (context: ExitContext) => {
	const screen = await expectExitReportedOnce(context)
	if (!isInBrowserRunner()) return

	await expect(screen).toHaveAttribute("data-still")
	await expect(
		getComputedStyle(slotIn(screen, "full-window-content")).opacity,
	).toBe("0")
	await expect(getComputedStyle(slotIn(screen, "app-boot-stage")).scale).toBe(
		"none",
	)
}

const provesExitAtMount = async ({ args, canvasElement }: ExitContext) => {
	const screen = slotIn(canvasElement, "app-boot-screen")

	await waitFor(() => expect(args.onExitComplete).toHaveBeenCalledOnce())
	await expect(screen.dataset.phase).toBe("leaving")
	await expect(shownHexagonsOf(screen)).toHaveLength(0)
	await expect(statusOf(screen)).toHaveTextContent("Starting Kiroshi")
}

const describedAs = (story: string) => ({ docs: { description: { story } } })

const meta = preview.meta({
	title: "Feedback/AppBootScreen",
	component: BootStage,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The surface a desktop window opens on while it reads the record: the whole window in the background of the scheme in force, with the three-cell Hive mark at launch size in its centre. Each cell is a full avatar hexagon: the first three of `agents`, completed with ink cells when fewer are known, so a first launch draws three ink cells. It says the app is starting and nothing more: no spinner, no progress bar, no product name, no way out. The host mounts it for as long as its first read is in flight, turns `isExiting` on at whatever moment the answer lands, and swaps in the shell when `onExitComplete` fires, once per exit. The mark alone carries the message, so when the reader asks for reduced motion the mark stands still and the status string is drawn under it instead of being left to screen readers. Reach for it on launch, never for a read a reader triggered: a refresh inside the app belongs to a skeleton where the data will land, not to a screen that takes the window back.",
			},
		},
	},
	beforeEach: schemeBeforeMount,
	args: { agents: 3, exit: false, replay: false, onExitComplete: fn() },
	argTypes: {
		exitsAfter: { table: { disable: true } },
		agents: {
			control: { type: "range", min: 0, max: 12, step: 1 },
			description:
				"How many agents the app knows at launch. 0 is the first launch: no agent known, ink only. Past three, only the first three are drawn.",
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

export const Default = meta.story({
	args: { agents: 5 },
	parameters: describedAs(
		"The launch with agents known, mounted the way the app mounts it: the whole window, with the drag region a frameless desktop window needs so a launch is still movable. Five agents are handed over and the first three take the cells. Entrance: the three cells fly in from outside at half size and dock. Loop: the trio hops a third of a turn every 1.5s, each cell staying upright. One cell at a time shows as its agent's own avatar, colour ground and colour field, for one hop. Check that the mark sits dead centre of the window and that the background is the scheme's own. Pick `Exit` for the way out, `Still` for reduced motion.",
	),
	play: provesRunning(CLUSTER_CELLS),
})

export const FirstLaunch = meta.story({
	args: { agents: 0 },
	parameters: describedAs(
		"The first launch, no agent known: the same trio, three ink hexagons with their cut, ground and outline, no colour at any moment.",
	),
	play: provesRunning(0),
})

export const Still = meta.story({
	parameters: describedAs(
		"What a reader who asks for reduced motion gets, which is how the test browser renders every story here: one still image, every cell a whole avatar hexagon at rest in ink, with the status written under it since nothing moves to say the app is starting. Turn reduced motion on at the system level to see it. The exit is a plain 150ms fade.",
	),
	play: provesStill,
})

export const Dark = Default.extend({
	globals: { theme: "dark" },
	parameters: describedAs(
		"The launch on the dark scheme. Check that the window is dark from its first frame, a white flash is the bug this screen exists to kill, and that the ink cells read on it.",
	),
})

export const Exit = meta.story({
	args: { exitsAfter: ENTRANCE_SEEN_AFTER },
	parameters: describedAs(
		"The way out. The story turns `isExiting` on by itself 1.6s after the mount, the same thing the `exit` control does at any other moment: the trio folds to half size with a sixth of a turn and fades in 300ms, then `onExitComplete` fires once, with nothing left on the window. Flip `replay` to watch it again.",
	),
	play: provesExit,
})

export const ExitStill = meta.story({
	tags: ["test-only"],
	args: { exitsAfter: ENTRANCE_SEEN_AFTER },
	play: provesStillExit,
})

export const ExitAtMount = meta.story({
	tags: ["test-only"],
	args: { exit: true },
	play: provesExitAtMount,
})

export const CentredIn700pxWindow = meta.story({
	...centredInWindowOf(700),
})

export const CentredIn1100pxWindow = meta.story({
	...centredInWindowOf(1100),
})
