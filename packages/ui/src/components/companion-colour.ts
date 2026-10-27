import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"

const BLOT_TINTS = [
	"red",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
	"orange",
] as const

type BotAvatarBlot = (typeof BLOT_TINTS)[number]

const BLOT_HUES: Record<BotAvatarBlot, number> = HUE_PRESETS

const hueOf = (blot?: BotAvatarBlot | null) =>
	blot ? BLOT_HUES[blot] : undefined

export { BLOT_HUES, BLOT_TINTS, type BotAvatarBlot, hueOf }
