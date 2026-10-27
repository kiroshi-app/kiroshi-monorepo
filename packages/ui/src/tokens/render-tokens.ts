import {
	HUE_THEMES,
	type HueTheme,
	type ToneSpec,
	toneOf,
	type YellowBand,
} from "../components/hue-recipe"

type Token = {
	light: string
	dark?: string
}

type HueSection = {
	presets: Record<string, number>
	"yellow-band": YellowBand
	tones: Record<string, Record<HueTheme, ToneSpec>>
}

export type TokenFile = {
	hue?: HueSection
	colors: Record<string, Token>
	parameters: Record<string, Token>
}

export type HueTones = Record<HueTheme, Record<string, ToneSpec>>

export type Srgb = {
	red: number
	green: number
	blue: number
	alpha: number
}

type Theme = "light" | "dark"

const REFERENCE = /^\{([a-z0-9-]+)\}$/
const EMBEDDED_REFERENCE = /\{([a-z0-9-]+)\}/g
const VAR_WITH_FALLBACK = /^var\(--[a-z0-9-]+, (.+)\)$/
const OKLAB_MIX = /^color-mix\(in oklab, (\S+) ([\d.]+)%, (\S+)\)$/
const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const RGB = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+%?))?\)$/
const OKLCH = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+%?))?\)$/

const referenceOf = (value: string) => REFERENCE.exec(value)?.[1]

const toCssValue = (value: string) =>
	value.replace(EMBEDDED_REFERENCE, "var(--$1)")

const declarations = (file: TokenFile, theme: Theme) =>
	Object.entries({ ...file.colors, ...file.parameters }).flatMap(
		([name, token]) => {
			const value = theme === "light" ? token.light : token.dark
			return value === undefined ? [] : [`\t--${name}: ${toCssValue(value)};`]
		},
	)

export const renderCss = (file: TokenFile) =>
	[
		":root, [data-hue] {",
		...declarations(file, "light"),
		"}",
		"",
		".dark, .dark [data-hue] {",
		...declarations(file, "dark"),
		"}",
		"",
	].join("\n")

const parseAlpha = (alpha: string | undefined) => {
	if (alpha === undefined) return 1
	return alpha.endsWith("%") ? Number.parseFloat(alpha) / 100 : Number(alpha)
}

const decodeGamma = (byte: number) => {
	const encoded = byte / 255
	return encoded <= 0.04045
		? encoded / 12.92
		: ((encoded + 0.055) / 1.055) ** 2.4
}

const encodeGamma = (linear: number) => {
	const magnitude = Math.abs(linear)
	const encoded =
		magnitude <= 0.0031308
			? 12.92 * magnitude
			: 1.055 * magnitude ** (1 / 2.4) - 0.055
	return Math.sign(linear) * encoded
}

const oklabToSrgb = (lightness: number, a: number, b: number) => {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	].map(encodeGamma)
}

const oklchToSrgb = (lightness: number, chroma: number, hue: number) => {
	const radians = (hue * Math.PI) / 180
	return oklabToSrgb(
		lightness,
		chroma * Math.cos(radians),
		chroma * Math.sin(radians),
	)
}

const srgbToOklab = ({ red, green, blue }: Srgb) => {
	const [r, g, b] = [red, green, blue].map(decodeGamma)
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	]
}

const toByte = (unit: number) =>
	Math.round(Math.min(1, Math.max(0, unit)) * 255)

export const toSrgb = (value: string): Srgb => {
	if (value === "transparent") return { red: 0, green: 0, blue: 0, alpha: 0 }
	const hex = HEX.exec(value)
	if (hex) {
		const [red, green, blue] = hex
			.slice(1)
			.map((pair) => Number.parseInt(pair, 16))
		return { red, green, blue, alpha: 1 }
	}
	const rgb = RGB.exec(value)
	if (rgb) {
		const [red, green, blue] = rgb.slice(1, 4).map(Number)
		return { red, green, blue, alpha: parseAlpha(rgb[4]) }
	}
	const oklch = OKLCH.exec(value)
	if (oklch) {
		const [red, green, blue] = oklchToSrgb(
			Number(oklch[1]),
			Number(oklch[2]),
			Number(oklch[3]),
		).map(toByte)
		return { red, green, blue, alpha: parseAlpha(oklch[4]) }
	}
	throw new Error(`Unsupported colour notation: ${value}`)
}

const mixInOklab = (first: Srgb, firstShare: number, second: Srgb): Srgb => {
	const firstWeight = first.alpha * firstShare
	const secondWeight = second.alpha * (1 - firstShare)
	const alpha = firstWeight + secondWeight
	const [firstLab, secondLab] = [first, second].map(srgbToOklab)
	const [lightness, a, b] = firstLab.map(
		(component, index) =>
			(component * firstWeight + secondLab[index] * secondWeight) / alpha,
	)
	const [red, green, blue] = oklabToSrgb(lightness, a, b).map(toByte)
	return { red, green, blue, alpha }
}

const resolveValue = (file: TokenFile, value: string, theme: Theme): Srgb => {
	const reference = referenceOf(value)
	if (reference) return resolve(file, reference, theme)
	const fallback = VAR_WITH_FALLBACK.exec(value)?.[1]
	if (fallback) return resolveValue(file, fallback, theme)
	const mix = OKLAB_MIX.exec(value)
	if (mix) {
		return mixInOklab(
			resolveValue(file, mix[1], theme),
			Number(mix[2]) / 100,
			resolveValue(file, mix[3], theme),
		)
	}
	return toSrgb(value)
}

const resolve = (file: TokenFile, name: string, theme: Theme): Srgb => {
	const token = file.colors[name]
	if (!token) throw new Error(`Unknown colour token: ${name}`)
	const value = theme === "dark" ? (token.dark ?? token.light) : token.light
	return resolveValue(file, value, theme)
}

const hexOfSrgb = ({ red, green, blue }: Srgb) =>
	`#${[red, green, blue].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`

const requireHue = (file: TokenFile) => {
	if (!file.hue) throw new Error("tokens.json has no hue section")
	return file.hue
}

export const hueTonesOf = (file: TokenFile): HueTones => {
	const { tones } = requireHue(file)
	const themeTones = (theme: HueTheme) =>
		Object.fromEntries(
			Object.entries(tones).map(([role, specs]) => {
				const spec = specs[theme]
				return [
					role,
					spec.contrast
						? {
								...spec,
								contrast: {
									...spec.contrast,
									with: hexOfSrgb(resolve(file, spec.contrast.with, theme)),
								},
							}
						: spec,
				]
			}),
		)
	return { light: themeTones("light"), dark: themeTones("dark") }
}

export const withHueColours = (file: TokenFile): TokenFile => {
	const { presets, "yellow-band": band } = requireHue(file)
	const tones = hueTonesOf(file)
	const presetColours = Object.entries(presets).flatMap(([preset, hue]) =>
		Object.keys(tones.light).map((role) => {
			const [light, dark] = HUE_THEMES.map(
				(theme) => toneOf(tones[theme][role], hue, band).hex,
			)
			return [`hue-${preset}-${role}`, { light, dark }] as const
		}),
	)
	return {
		...file,
		colors: { ...Object.fromEntries(presetColours), ...file.colors },
	}
}

export const withBlotAliases = (file: TokenFile): TokenFile => ({
	...file,
	colors: {
		...file.colors,
		...Object.fromEntries(
			Object.keys(requireHue(file).presets).map((preset) => [
				`bot-blot-${preset}`,
				{
					light: `{hue-${preset}-accent}`,
					dark: `{hue-${preset}-accent}`,
				},
			]),
		),
	},
})

const toComponent = (byte: number) =>
	`0x${byte.toString(16).toUpperCase().padStart(2, "0")}`

const colorEntry = (srgb: Srgb) => ({
	"color-space": "srgb",
	components: {
		alpha: srgb.alpha.toFixed(3),
		blue: toComponent(srgb.blue),
		green: toComponent(srgb.green),
		red: toComponent(srgb.red),
	},
})

const XCODE_INFO = { author: "xcode", version: 1 }

const toJson = (value: unknown) => `${JSON.stringify(value, null, "\t")}\n`

export const CATALOGUE_CONTENTS = toJson({ info: XCODE_INFO })

export const renderColorSets = (file: TokenFile) =>
	Object.keys(file.colors).map((name) => ({
		name,
		contents: toJson({
			colors: [
				{
					color: colorEntry(resolve(file, name, "light")),
					idiom: "universal",
				},
				{
					appearances: [{ appearance: "luminosity", value: "dark" }],
					color: colorEntry(resolve(file, name, "dark")),
					idiom: "universal",
				},
			],
			info: XCODE_INFO,
		}),
	}))
