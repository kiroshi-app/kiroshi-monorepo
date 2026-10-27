import {
	BLOT_TINTS,
	type BotAvatarBlot,
} from "@workspace/ui/components/companion-colour"

import type { Hue } from "@/lib/bindings"

const TURN = 360

const HUE_OF_PRESET: Record<BotAvatarBlot, Hue> = {
	red: 42,
	orange: 63,
	yellow: 82,
	green: 132,
	cyan: 186,
	blue: 257,
	purple: 296,
	pink: 358,
}

const PRESETS = Object.entries(HUE_OF_PRESET) as [BotAvatarBlot, Hue][]

const distanceOnTheCircle = (hue: Hue, preset: Hue) => {
	const gap = Math.abs(hue - preset)
	return Math.min(gap, TURN - gap)
}

const isNearer = (hue: Hue, candidate: Hue, held: Hue) => {
	const candidateGap = distanceOnTheCircle(hue, candidate)
	const heldGap = distanceOnTheCircle(hue, held)
	return (
		candidateGap < heldGap || (candidateGap === heldGap && candidate < held)
	)
}

export const presetOfHue = (hue: Hue): BotAvatarBlot =>
	PRESETS.reduce((nearest, candidate) =>
		isNearer(hue, candidate[1], nearest[1]) ? candidate : nearest,
	)[0]

export const hueOfPreset = (preset: BotAvatarBlot): Hue => HUE_OF_PRESET[preset]

export const PRESET_HUES: readonly Hue[] = BLOT_TINTS.map(hueOfPreset)

export const hueAfterPick = (
	picked: BotAvatarBlot | undefined,
	held: Hue | null,
): Hue | null => {
	if (picked === undefined) return null
	if (held !== null && presetOfHue(held) === picked) return held
	return hueOfPreset(picked)
}
