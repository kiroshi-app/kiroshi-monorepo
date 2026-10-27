type HueTheme = "light" | "dark"

type ToneContrast = { with: string; ratio: number }

type YellowTone = { hue: number; lightness: number; chroma: number }

type ToneSpec = {
	lightness: number
	chroma: number
	contrast?: ToneContrast
	yellow?: YellowTone
}

type YellowBand = { centre: number; radius: number }

type HueTone = { lightness: number; chroma: number; hue: number; hex: string }

const HUE_THEMES: HueTheme[] = ["light", "dark"]

const LIGHTNESS_STEP = 0.0025
const LIGHTNESS_RESOLUTION = 1e4
const CHROMA_SEARCH_STEPS = 24
const GAMUT_TOLERANCE = 1e-6

const normaliseHue = (hue: number) => ((hue % 360) + 360) % 360

const hueDistance = (from: number, to: number) =>
	Math.abs(((from - to + 540) % 360) - 180)

const linearSrgbOf = (lightness: number, chroma: number, hue: number) => {
	const radians = (hue * Math.PI) / 180
	const a = chroma * Math.cos(radians)
	const b = chroma * Math.sin(radians)
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	]
}

const isInSrgb = (lightness: number, chroma: number, hue: number) =>
	linearSrgbOf(lightness, chroma, hue).every(
		(channel) => channel >= -GAMUT_TOLERANCE && channel <= 1 + GAMUT_TOLERANCE,
	)

const gamutChroma = (lightness: number, chroma: number, hue: number) => {
	if (isInSrgb(lightness, chroma, hue)) return chroma
	let inside = 0
	let outside = chroma
	for (let step = 0; step < CHROMA_SEARCH_STEPS; step++) {
		const middle = (inside + outside) / 2
		if (isInSrgb(lightness, middle, hue)) inside = middle
		else outside = middle
	}
	return inside
}

const gammaOf = (linear: number) => {
	const clamped = Math.min(1, Math.max(0, linear))
	return clamped <= 0.0031308
		? clamped * 12.92
		: 1.055 * clamped ** (1 / 2.4) - 0.055
}

const hexOf = (lightness: number, chroma: number, hue: number) =>
	`#${linearSrgbOf(lightness, chroma, hue)
		.map((linear) =>
			Math.round(gammaOf(linear) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`

const linearOfByte = (byte: number) => {
	const encoded = byte / 255
	return encoded <= 0.04045
		? encoded / 12.92
		: ((encoded + 0.055) / 1.055) ** 2.4
}

const relativeLuminance = (hex: string) => {
	const [red, green, blue] = [1, 3, 5].map((offset) =>
		linearOfByte(Number.parseInt(hex.slice(offset, offset + 2), 16)),
	)
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

const contrastRatio = (first: string, second: string) => {
	const [lighter, darker] = [
		relativeLuminance(first),
		relativeLuminance(second),
	].sort((a, b) => b - a)
	return (lighter + 0.05) / (darker + 0.05)
}

const yellowWeight = (hue: number, { centre, radius }: YellowBand) => {
	const distance = hueDistance(hue, centre)
	return distance < radius
		? Math.cos(((Math.PI / 2) * distance) / radius) ** 2
		: 0
}

const correctedTone = (spec: ToneSpec, hue: number, band: YellowBand) => {
	const { lightness, chroma, yellow } = spec
	if (!yellow) return { lightness, chroma, hue }
	const weight = yellowWeight(hue, band)
	const blend = (from: number, to: number) => from + (to - from) * weight
	return {
		lightness: blend(lightness, yellow.lightness),
		chroma: blend(chroma, yellow.chroma),
		hue: normaliseHue(blend(hue, hue + yellow.hue - band.centre)),
	}
}

const roundLightness = (lightness: number) =>
	Math.round(lightness * LIGHTNESS_RESOLUTION) / LIGHTNESS_RESOLUTION

const toneOf = (spec: ToneSpec, hue: number, band: YellowBand): HueTone => {
	const corrected = correctedTone(spec, normaliseHue(hue), band)
	const toneAt = (lightness: number): HueTone => {
		const chroma = gamutChroma(lightness, corrected.chroma, corrected.hue)
		return {
			lightness,
			chroma,
			hue: corrected.hue,
			hex: hexOf(lightness, chroma, corrected.hue),
		}
	}
	let tone = toneAt(roundLightness(corrected.lightness))
	if (!spec.contrast) return tone
	const { with: against, ratio } = spec.contrast
	const direction =
		relativeLuminance(against) > relativeLuminance(tone.hex) ? -1 : 1
	while (
		contrastRatio(tone.hex, against) < ratio &&
		tone.lightness > 0 &&
		tone.lightness < 1
	)
		tone = toneAt(roundLightness(tone.lightness + direction * LIGHTNESS_STEP))
	return tone
}

export {
	contrastRatio,
	HUE_THEMES,
	type HueTheme,
	type HueTone,
	hueDistance,
	isInSrgb,
	type ToneSpec,
	toneOf,
	type YellowBand,
}
