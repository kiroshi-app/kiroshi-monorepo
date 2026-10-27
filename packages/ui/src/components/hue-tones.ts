export const HUE_PRESETS = {
	red: 42,
	orange: 63,
	yellow: 82,
	green: 132,
	cyan: 186,
	blue: 257,
	purple: 296,
	pink: 358,
} as const

export const YELLOW_BAND = { centre: 82, radius: 20 } as const

export const HUE_TONES = {
	light: {
		bubble: {
			lightness: 0.87,
			chroma: 0.075,
			contrast: { with: "#020202", ratio: 7 },
		},
		accent: {
			lightness: 0.5,
			chroma: 0.13,
			contrast: { with: "#ffffff", ratio: 4.5 },
			yellow: { hue: 75, lightness: 0.54, chroma: 0.115 },
		},
		"new-line": { lightness: 0.8, chroma: 0.06 },
		"avatar-ink": { lightness: 0.56, chroma: 0.13 },
		"avatar-ground": { lightness: 0.93, chroma: 0.035 },
		"conversation-icon": { lightness: 0.92, chroma: 0.033 },
		"conversation-icon-foreground": { lightness: 0.45, chroma: 0.054 },
	},
	dark: {
		bubble: {
			lightness: 0.45,
			chroma: 0.1,
			contrast: { with: "#f5f5f5", ratio: 7.2 },
		},
		accent: {
			lightness: 0.78,
			chroma: 0.12,
			contrast: { with: "#121213", ratio: 4.5 },
		},
		"new-line": { lightness: 0.4, chroma: 0.06 },
		"avatar-ink": { lightness: 0.8, chroma: 0.12 },
		"avatar-ground": { lightness: 0.3, chroma: 0.04 },
		"conversation-icon": { lightness: 0.385, chroma: 0.033 },
		"conversation-icon-foreground": { lightness: 0.8, chroma: 0.054 },
	},
} as const
