import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import {
	companionSeed,
	type FieldState,
	fieldIntensity,
	pickSilhouette,
	seededRandom,
} from "@workspace/ui/components/companion-field"
import {
	COMPANION_SILHOUETTE_SPACE,
	silhouetteCells,
} from "@workspace/ui/components/companion-silhouette"
import {
	type FieldGrid,
	type FieldPoint,
	hexagonCorners,
	honeycombGrid,
} from "@workspace/ui/components/field-grid"
import {
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

type AvatarTheme = "light" | "dark"

type CompanionAvatarInput = {
	name: string
	tint?: BotAvatarBlot
	state: FieldState
	time: number
	theme: AvatarTheme
}

type AvatarCell = { u: number; v: number; radius: number }

type Srgb = { red: number; green: number; blue: number }

type AvatarOutline = { side: number; path: string }

type ToneOpacity = { tone: number; opacity: number }

type CompanionAvatar = {
	cells: AvatarCell[]
	tones: number[]
	toneOpacities: ToneOpacity[]
	cellCorners: FieldPoint[]
	cellColour: Srgb
	groundColour: Srgb
	outline: AvatarOutline
}

type DensityField = {
	grid: FieldGrid
	silhouette: Float32Array
	lattice: Float32Array
	mask?: Uint8Array
}

type Oklab = { lightness: number; a: number; b: number }

type ThemeColours = {
	untinted: string
	fieldLightness: number
	groundStrength: number
	secondary: string
}

const FIELD_CELLS = 16
const LATTICE = 5
const BLOB_SIGMA = 0.055
const COLUMN_STEP = 0.13
const ROW_STEP = 0.1
const FLOOR = 0.03
const NOISE_AMPLITUDE = 0.2
const SILHOUETTE_WEIGHT = 0.95
const DRIFT_PERIOD = 9000
const STATE_HOLD = 0.6
const HUE_SALT = 0x51ed270b
const HUE_JITTER = 12
const FIELD_CHROMA = 0.16
const CELL_SHARE = 0.9
const TONES = [0, 0.5, 1]
const TONE_OPACITIES: ToneOpacity[] = [
	{ tone: 0.5, opacity: 0.45 },
	{ tone: 1, opacity: 1 },
]
const RADIANS_PER_DEGREE = Math.PI / 180
const CHANNEL_RESOLUTION = 1e6

const BLOT_COLOURS: Record<BotAvatarBlot, string> = {
	red: "#f4a98c",
	yellow: "#f2c879",
	green: "#afc99b",
	cyan: "#92c9c2",
	blue: "#a0bee8",
	purple: "#bcafe3",
	pink: "#f0a9c0",
	orange: "#f2b57e",
}

const THEME_COLOURS: Record<AvatarTheme, ThemeColours> = {
	light: {
		untinted: "#1d3ccd",
		fieldLightness: 0.5,
		groundStrength: 0.25,
		secondary: "#f2f2f2",
	},
	dark: {
		untinted: "#75acff",
		fieldLightness: 0.8,
		groundStrength: 0.35,
		secondary: "#262626",
	},
}

const COMPANION_GRID = honeycombGrid(FIELD_CELLS, CELL_SHARE)

const CELL_CORNERS = hexagonCorners({ u: 0, v: 0 }, 1)

const COMPANION_OUTLINE: AvatarOutline = {
	side: OUTER.halfWidth * 2,
	path: roundedHexagonPath(OUTER),
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

const engineStable = (channel: number) =>
	Math.round(channel * CHANNEL_RESOLUTION) / CHANNEL_RESOLUTION

const fieldLattice = (seed: number) =>
	Float32Array.from({ length: LATTICE * LATTICE }, seededRandom(seed))

const densityField = (seed: number, grid: FieldGrid): DensityField => {
	const glyph = silhouetteCells(
		pickSilhouette(seed, COMPANION_SILHOUETTE_SPACE),
	).map(({ column, row }) => ({
		x: 0.5 + (column - 2) * COLUMN_STEP,
		y: 0.5 + (row - 3) * ROW_STEP,
	}))
	const silhouette = Float32Array.from(grid.points, ({ u, v }) => {
		let sum = 0
		for (const blob of glyph)
			sum += Math.exp(
				-((u - blob.x) ** 2 + (v - blob.y) ** 2) / (2 * BLOB_SIGMA ** 2),
			)
		return clamp01(sum)
	})
	return { grid, silhouette, lattice: fieldLattice(seed) }
}

const companionField = (name: string) =>
	densityField(companionSeed(name), COMPANION_GRID)

const smooth = (value: number) => value * value * (3 - 2 * value)

const noiseAt = (lattice: Float32Array, u: number, v: number) => {
	const x = (((u % 1) + 1) % 1) * LATTICE
	const y = (((v % 1) + 1) % 1) * LATTICE
	const x0 = Math.floor(x)
	const y0 = Math.floor(y)
	const at = (column: number, row: number) =>
		lattice[(row % LATTICE) * LATTICE + (column % LATTICE)]
	const fx = smooth(x - x0)
	const fy = smooth(y - y0)
	const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx
	const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx
	return top + (bottom - top) * fy
}

const densities = (
	{ grid, silhouette, lattice }: DensityField,
	state: FieldState,
	time: number,
) => {
	const drift = state === "idle" ? 0 : time / DRIFT_PERIOD
	return Array.from(silhouette, (shape, index) => {
		const { u, v } = grid.points[index]
		const floor = FLOOR + NOISE_AMPLITUDE * noiseAt(lattice, u + drift, v)
		const hold =
			STATE_HOLD +
			(1 - STATE_HOLD) *
				fieldIntensity(state, { x: u * 2 - 1, y: v * 2 - 1 }, time)
		return clamp01((floor + SILHOUETTE_WEIGHT * shape) * hold)
	})
}

const organicTones = (field: number[], { ahead }: FieldGrid) => {
	const error = Float32Array.from(field)
	return Array.from(error, (_, index) => {
		const value = error[index]
		const tone = TONES.reduce((best, next) =>
			Math.abs(next - value) < Math.abs(best - value) ? next : best,
		)
		for (const { to, share } of ahead[index])
			error[to] += (value - tone) * share
		return tone
	})
}

const fieldTones = (field: DensityField, state: FieldState, time: number) =>
	organicTones(densities(field, state, time), field.grid).map((tone, index) =>
		field.mask?.[index] === 0 ? 0 : tone,
	)

const fieldCells = ({ points, radius }: FieldGrid): AvatarCell[] =>
	points.map(({ u, v }) => ({ u, v, radius: radius * CELL_SHARE }))

const hueShift = (name: string) => {
	const random = seededRandom(companionSeed(name) ^ HUE_SALT)
	return Math.round((random() * 2 - 1) * HUE_JITTER)
}

const toLinear = (channel: number) =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const toGamma = (channel: number) =>
	channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

const srgbOfHex = (hex: string): Srgb => {
	const channel = (offset: number) =>
		Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
	return { red: channel(1), green: channel(3), blue: channel(5) }
}

const oklabOf = ({ red, green, blue }: Srgb): Oklab => {
	const r = toLinear(red)
	const g = toLinear(green)
	const b = toLinear(blue)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return {
		lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	}
}

const srgbOf = ({ lightness, a, b }: Oklab): Srgb => {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	const gamma = (linear: number) => engineStable(clamp01(toGamma(linear)))
	return {
		red: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		green: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		blue: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	}
}

const cellColourOf = (
	name: string,
	theme: AvatarTheme,
	tint?: BotAvatarBlot,
): Srgb => {
	if (!tint) return srgbOfHex(THEME_COLOURS[theme].untinted)
	const { a, b } = oklabOf(srgbOfHex(BLOT_COLOURS[tint]))
	const hue = Math.atan2(b, a) + hueShift(name) * RADIANS_PER_DEGREE
	return srgbOf({
		lightness: THEME_COLOURS[theme].fieldLightness,
		a: FIELD_CHROMA * Math.cos(hue),
		b: FIELD_CHROMA * Math.sin(hue),
	})
}

const groundColourOf = (theme: AvatarTheme, tint?: BotAvatarBlot): Srgb => {
	const { untinted, groundStrength, secondary } = THEME_COLOURS[theme]
	const field = oklabOf(srgbOfHex(tint ? BLOT_COLOURS[tint] : untinted))
	const surface = oklabOf(srgbOfHex(secondary))
	const mix = (key: keyof Oklab) =>
		field[key] * groundStrength + surface[key] * (1 - groundStrength)
	return srgbOf({ lightness: mix("lightness"), a: mix("a"), b: mix("b") })
}

const companionAvatar = ({
	name,
	tint,
	state,
	time,
	theme,
}: CompanionAvatarInput): CompanionAvatar => {
	const field = companionField(name)
	return {
		cells: fieldCells(field.grid),
		tones: fieldTones(field, state, time),
		toneOpacities: TONE_OPACITIES,
		cellCorners: CELL_CORNERS,
		cellColour: cellColourOf(name, theme, tint),
		groundColour: groundColourOf(theme, tint),
		outline: COMPANION_OUTLINE,
	}
}

export {
	type AvatarCell,
	BLOT_COLOURS,
	COMPANION_OUTLINE,
	type CompanionAvatarInput,
	companionAvatar,
	companionField,
	type DensityField,
	FIELD_CELLS,
	FIELD_CHROMA,
	fieldCells,
	fieldLattice,
	fieldTones,
	hueShift,
	oklabOf,
	type Srgb,
	srgbOfHex,
	TONE_OPACITIES,
}
