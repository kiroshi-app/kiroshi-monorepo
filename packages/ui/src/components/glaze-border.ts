type GlazeTheme = "light" | "dark"

type Translucent = { colour: string; opacity: number }

const COMPACT_BELOW = 20

const GLAZE_THEMES: GlazeTheme[] = ["light", "dark"]

const THEME_LAYER: Record<GlazeTheme, string> = {
	light: "dark:hidden",
	dark: "hidden dark:inline",
}

const GLAZE_EDGE: Record<GlazeTheme, Translucent> = {
	light: { colour: "#000000", opacity: 0.08 },
	dark: { colour: "#ffffff", opacity: 0.1 },
}

const COMPACT_EDGE: Record<GlazeTheme, Translucent> = {
	light: { colour: "#000000", opacity: 0.1 },
	dark: { colour: "#ffffff", opacity: 0.12 },
}

const LIP_OPACITY: Record<GlazeTheme, number> = {
	light: 0.55,
	dark: 0.22,
}

const GLAZE_EDGE_SHARE = 0.025

const COMPACT_EDGE_SHARE = 0.05

const isCompactAt = (size: number) => size < COMPACT_BELOW

const edgeWidthOf = (size: number) =>
	isCompactAt(size)
		? COMPACT_EDGE_SHARE * size
		: Math.max(1, GLAZE_EDGE_SHARE * size)

export {
	COMPACT_BELOW,
	COMPACT_EDGE,
	edgeWidthOf,
	GLAZE_EDGE,
	GLAZE_THEMES,
	type GlazeTheme,
	isCompactAt,
	LIP_OPACITY,
	THEME_LAYER,
}
