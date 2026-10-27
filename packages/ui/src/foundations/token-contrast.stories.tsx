import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"
import { Button } from "@workspace/ui/components/ui/button"
import { Switch } from "@workspace/ui/components/ui/switch"
import {
	ACTION_TOKENS,
	SIDEBAR_TOKENS,
	SURFACE_TOKENS,
} from "@workspace/ui/foundations/color-tokens"
import { contrastRatio, type Rgb } from "@workspace/ui/lib/contrast"

type TokenPair = { background: string; foreground: string }
type ThemeName = "light" | "dark"

const AA_TEXT_RATIO = 4.5
const AA_NON_TEXT_RATIO = 3
const FOREGROUND_SUFFIX = "-foreground"
const THEMES: ThemeName[] = ["light", "dark"]
const TRANSPARENT_COMPUTED_COLOR = "rgba(0, 0, 0, 0)"
const CANVAS_BASE: Rgb = [255, 255, 255]
const LIGHT_PAGE: Rgb = [245, 245, 245]
const DARK_CARD: Rgb = [18, 18, 19]
const PRIMARY_STRONG_ON_CANVAS_BASE_FLOOR = 5
const PRIMARY_STRONG_ON_LIGHT_PAGE_FLOOR = 4.5
const SHOWCASED_TINTS: BotAvatarBlot[] = ["yellow", "purple"]
const FOCUS_PROBE = "[data-focus-probe]"

const SEMANTIC_TOKENS = [...SURFACE_TOKENS, ...ACTION_TOKENS, ...SIDEBAR_TOKENS]

const ROOT_PAIR: TokenPair = {
	background: "--background",
	foreground: "--foreground",
}

const SUFFIXED_PAIRS: TokenPair[] = SEMANTIC_TOKENS.filter((token) =>
	SEMANTIC_TOKENS.includes(`${token}${FOREGROUND_SUFFIX}`),
).map((background) => ({
	background,
	foreground: `${background}${FOREGROUND_SUFFIX}`,
}))

const CROSS_FAMILY_PAIRS: TokenPair[] = [
	{ background: "--sidebar", foreground: "--muted-foreground" },
	{ background: "--sidebar-accent", foreground: "--muted-foreground" },
	{ background: ROOT_PAIR.background, foreground: "--bot-badge-attention" },
]

const USER_BUBBLE_PAIR: TokenPair = {
	background: "--user-bubble",
	foreground: "--user-bubble-foreground",
}

const USER_BUBBLE_MUTED_PAIR: TokenPair = {
	background: "--user-bubble",
	foreground: "--color-muted-foreground",
}

const TINTED_USER_BUBBLE_PAIRS = [USER_BUBBLE_PAIR, USER_BUBBLE_MUTED_PAIR]

const WARNING_PAIRS: TokenPair[] = [
	{ background: ROOT_PAIR.background, foreground: "--warning" },
	{
		background: ROOT_PAIR.background,
		foreground: "--state-needs-authorization",
	},
	{ background: "--sidebar", foreground: "--warning" },
	{ background: "--warning", foreground: "--warning-foreground" },
]

const TOKEN_PAIRS = [
	ROOT_PAIR,
	...SUFFIXED_PAIRS,
	...CROSS_FAMILY_PAIRS,
	USER_BUBBLE_PAIR,
	{
		background: "--destructive-tint",
		foreground: "--destructive-tint-foreground",
	},
]

const pairKey = (scheme: ThemeName, pair: TokenPair) =>
	`${scheme} ${pair.foreground} on ${pair.background}`

const createPixel = () => {
	const canvas = document.createElement("canvas")
	canvas.width = 1
	canvas.height = 1
	const pixel = canvas.getContext("2d", { willReadFrequently: true })
	if (!pixel) {
		throw new Error("2D canvas context unavailable, cannot rasterise tokens.")
	}
	return pixel
}

const readComputedColor = (scope: HTMLElement, token: string) => {
	const probe = document.createElement("div")
	probe.style.backgroundColor = `var(${token})`
	scope.append(probe)
	const color = getComputedStyle(probe).backgroundColor
	probe.remove()
	if (color === TRANSPARENT_COMPUTED_COLOR) {
		throw new Error(`Token ${token} resolves to nothing, it no longer exists.`)
	}
	return color
}

const paintOver = (
	pixel: CanvasRenderingContext2D,
	base: Rgb,
	color: string,
): Rgb => {
	pixel.fillStyle = `rgb(${base[0]} ${base[1]} ${base[2]})`
	pixel.fillRect(0, 0, 1, 1)
	pixel.fillStyle = color
	pixel.fillRect(0, 0, 1, 1)
	const [red, green, blue] = pixel.getImageData(0, 0, 1, 1).data
	return [red, green, blue]
}

type ThemeProbe = {
	scheme: ThemeName
	scope: HTMLElement
	surface: Rgb
}

const probeTheme = (
	pixel: CanvasRenderingContext2D,
	canvasElement: HTMLElement,
	scheme: ThemeName,
): ThemeProbe => {
	const scope = canvasElement.querySelector<HTMLElement>(
		`[data-scheme-scope="${scheme}"]`,
	)
	if (!scope) {
		throw new Error(`Missing theme scope for ${scheme}.`)
	}
	return {
		scheme,
		scope,
		surface: paintOver(
			pixel,
			CANVAS_BASE,
			readComputedColor(scope, ROOT_PAIR.background),
		),
	}
}

const measurePair = (
	pixel: CanvasRenderingContext2D,
	theme: ThemeProbe,
	pair: TokenPair,
) => {
	const background = paintOver(
		pixel,
		theme.surface,
		readComputedColor(theme.scope, pair.background),
	)
	const foreground = paintOver(
		pixel,
		background,
		readComputedColor(theme.scope, pair.foreground),
	)
	return contrastRatio(background, foreground)
}

type Measurement = { key: string; ratio: number }

const failuresIn = (measurements: Measurement[], floor = AA_TEXT_RATIO) =>
	measurements
		.filter(({ ratio }) => ratio < floor)
		.map(
			({ key, ratio }) =>
				`${key}: measured ${ratio.toFixed(2)}:1, needs ${floor}:1`,
		)

const tintScopeIn = (scope: HTMLElement, blot: BotAvatarBlot) => {
	const tinted = scope.querySelector<HTMLElement>(`[data-blot-scope="${blot}"]`)
	if (!tinted) {
		throw new Error(`Missing tint scope for ${blot}.`)
	}
	return tinted
}

const meta = preview.meta({
	title: "Foundations/Token Contrast",
	tags: ["test-only", "!autodocs"],
	parameters: { layout: "fullscreen" },
	render: () => (
		<>
			{THEMES.map((scheme) => (
				<div key={scheme} className={scheme} data-scheme-scope={scheme} />
			))}
		</>
	),
})

export const SemanticPairsMeetAaText = meta.story({
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const [light, dark] = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		)

		await expect(
			light.surface,
			"Theme scopes resolve to the same surface, the theme class is not applied.",
		).not.toEqual(dark.surface)

		const measurements = [light, dark].flatMap((probe) =>
			TOKEN_PAIRS.map((pair) => ({
				key: pairKey(probe.scheme, pair),
				ratio: measurePair(pixel, probe, pair),
			})),
		)
		const problems = failuresIn(measurements)

		await expect(
			problems,
			`Semantic token pairs failing their contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})

export const WarningMeetsAaNonText = meta.story({
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const measurements = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		).flatMap((probe) =>
			WARNING_PAIRS.map((pair) => ({
				key: pairKey(probe.scheme, pair),
				ratio: measurePair(pixel, probe, pair),
			})),
		)
		const problems = failuresIn(measurements, AA_NON_TEXT_RATIO)

		await expect(
			problems,
			`Warning failing its non-text contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})

export const TintedUserBubbleMeetsAaText = meta.story({
	render: () => (
		<>
			{THEMES.map((scheme) => (
				<div key={scheme} className={scheme} data-scheme-scope={scheme}>
					{BLOT_TINTS.map((blot) => (
						<div
							key={blot}
							data-blot-scope={blot}
							className="on-user-bubble"
							{...hueScopeOf(blot)}
						/>
					))}
				</div>
			))}
		</>
	),
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const measurements = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		).flatMap((theme) =>
			BLOT_TINTS.flatMap((blot) => {
				const scope = tintScopeIn(theme.scope, blot)
				return TINTED_USER_BUBBLE_PAIRS.map((pair) => ({
					key: `${theme.scheme} ${blot} ${pairKey(theme.scheme, pair)}`,
					ratio: measurePair(pixel, { ...theme, scope }, pair),
				}))
			}),
		)
		const problems = failuresIn(measurements)

		await expect(
			problems,
			`Tinted user bubbles failing their contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})

const opaqueColor = (
	pixel: CanvasRenderingContext2D,
	scope: HTMLElement,
	token: string,
) => paintOver(pixel, CANVAS_BASE, readComputedColor(scope, token))

const DESTRUCTIVE_BUTTON_SURFACES = ["--card", "--background"]

export const DestructiveButtonMeetsAaText = meta.story({
	render: () => (
		<>
			{THEMES.map((scheme) => (
				<div key={scheme} className={scheme} data-scheme-scope={scheme}>
					{DESTRUCTIVE_BUTTON_SURFACES.map((surface) => (
						<div
							key={surface}
							data-surface-scope={surface}
							style={{ backgroundColor: `var(${surface})` }}
						>
							<Button variant="destructive" size="sm">
								Delete conversation
							</Button>
						</div>
					))}
				</div>
			))}
		</>
	),
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const measurements = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		).flatMap(({ scheme, scope }) =>
			DESTRUCTIVE_BUTTON_SURFACES.map((surface) => {
				const button = scope.querySelector<HTMLElement>(
					`[data-surface-scope="${surface}"] button`,
				)
				if (!button) {
					throw new Error(`Missing destructive button on ${surface}.`)
				}
				const { backgroundColor, color } = getComputedStyle(button)
				const fill = paintOver(
					pixel,
					opaqueColor(pixel, scope, surface),
					backgroundColor,
				)
				return {
					key: `${scheme} --destructive on the destructive fill on ${surface}`,
					ratio: contrastRatio(fill, paintOver(pixel, fill, color)),
				}
			}),
		)
		const problems = failuresIn(measurements)

		await expect(
			problems,
			`Destructive button failing its contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})

type PrimaryMeasurement = Measurement & { floor: number }

const primaryMeasurements = (
	pixel: CanvasRenderingContext2D,
	scheme: ThemeName,
	scope: HTMLElement,
	blot: BotAvatarBlot,
): PrimaryMeasurement[] => {
	const key = (pair: string) => `${scheme} ${blot} ${pair}`
	const primary = opaqueColor(pixel, scope, "--primary")
	const onPrimary = {
		key: key("--primary-foreground on --primary"),
		ratio: contrastRatio(
			primary,
			opaqueColor(pixel, scope, "--primary-foreground"),
		),
		floor: AA_TEXT_RATIO,
	}
	if (scheme === "dark") {
		return [
			onPrimary,
			{
				key: key("--primary on #121213"),
				ratio: contrastRatio(primary, DARK_CARD),
				floor: AA_TEXT_RATIO,
			},
		]
	}
	const strong = opaqueColor(pixel, scope, "--primary-strong")
	return [
		onPrimary,
		{
			key: key("--primary-strong on #fff"),
			ratio: contrastRatio(strong, CANVAS_BASE),
			floor: PRIMARY_STRONG_ON_CANVAS_BASE_FLOOR,
		},
		{
			key: key("--primary-strong on #f5f5f5"),
			ratio: contrastRatio(strong, LIGHT_PAGE),
			floor: PRIMARY_STRONG_ON_LIGHT_PAGE_FLOOR,
		},
	]
}

export const PrimaryOnEveryTintMeetsItsFloors = meta.story({
	render: () => (
		<>
			{THEMES.map((scheme) => (
				<div key={scheme} className={scheme} data-scheme-scope={scheme}>
					{BLOT_TINTS.map((blot) => (
						<div key={blot} data-blot-scope={blot} {...hueScopeOf(blot)} />
					))}
				</div>
			))}
		</>
	),
	play: async ({ canvasElement }) => {
		const pixel = createPixel()
		const scopes = THEMES.map((scheme) =>
			probeTheme(pixel, canvasElement, scheme),
		).flatMap(({ scheme, scope }) =>
			BLOT_TINTS.map((blot) => ({
				scheme,
				blot,
				scope: tintScopeIn(scope, blot),
			})),
		)

		const unfollowed = scopes
			.filter(
				({ scheme, scope }) =>
					readComputedColor(scope, "--primary") !==
					readComputedColor(scope, `--hue-${scheme}-accent`),
			)
			.map(({ scheme, blot }) => `${scheme} ${blot}`)
		await expect(
			unfollowed,
			`--primary not following the Space hue accent:\n${unfollowed.join("\n")}`,
		).toEqual([])

		const problems = scopes
			.flatMap(({ scheme, scope, blot }) =>
				primaryMeasurements(pixel, scheme, scope, blot),
			)
			.flatMap(({ floor, ...measurement }) => failuresIn([measurement], floor))
		await expect(
			problems,
			`Primary pairs failing their contrast floor:\n${problems.join("\n")}`,
		).toEqual([])
	},
})

type TintedPrimaryShowcaseProps = { scheme: ThemeName }

const TintedPrimaryShowcase = ({ scheme }: TintedPrimaryShowcaseProps) => (
	<div
		className={`${scheme} flex flex-col gap-4 bg-background p-6 text-foreground`}
	>
		{SHOWCASED_TINTS.map((blot) => (
			<div key={blot} {...hueScopeOf(blot)} className="flex items-center gap-3">
				<Button>Save memory</Button>
				<Button variant="outline" data-focus-probe>
					Connect
				</Button>
				<span
					aria-hidden="true"
					className="size-2 rounded-full bg-primary-strong"
				/>
				<Switch defaultChecked aria-label={`${blot} notifications`} />
			</div>
		))}
	</div>
)

export const TintedPrimaryLight = meta.story({
	parameters: { pseudo: { focusVisible: FOCUS_PROBE } },
	render: () => <TintedPrimaryShowcase scheme="light" />,
})

export const TintedPrimaryDark = meta.story({
	parameters: { pseudo: { focusVisible: FOCUS_PROBE } },
	render: () => <TintedPrimaryShowcase scheme="dark" />,
})
