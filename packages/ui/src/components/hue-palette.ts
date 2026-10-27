import {
	HUE_THEMES,
	type HueTheme,
	type HueTone,
	toneOf,
} from "@workspace/ui/components/hue-recipe"
import { HUE_TONES, YELLOW_BAND } from "@workspace/ui/components/hue-tones"

type HueRole = keyof (typeof HUE_TONES)["light"]

type HueStyle = Record<`--hue-${HueTheme}-${string}`, string>

const HUE_ROLES = Object.keys(HUE_TONES.light) as HueRole[]

const tones = new Map<string, HueTone>()

const hueTone = (hue: number, theme: HueTheme, role: HueRole) => {
	const key = `${hue} ${theme} ${role}`
	const cached = tones.get(key)
	if (cached) return cached
	const tone = toneOf(HUE_TONES[theme][role], hue, YELLOW_BAND)
	tones.set(key, tone)
	return tone
}

const hueStyle = (hue: number): HueStyle =>
	Object.fromEntries(
		HUE_THEMES.flatMap((theme) => [
			...HUE_ROLES.map((role) => [
				`--hue-${theme}-${role}`,
				hueTone(hue, theme, role).hex,
			]),
			[
				`--hue-${theme}-bubble-foreground`,
				HUE_TONES[theme].bubble.contrast.with,
			],
		]),
	)

export { HUE_ROLES, type HueRole, hueStyle, hueTone }
