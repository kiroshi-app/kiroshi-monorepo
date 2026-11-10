const BOARD_STICKY_COLOURS = [
	"yellow",
	"green",
	"pink",
	"blue",
	"orange",
] as const

const BOARD_SECTION_TINTS = ["blue", "purple"] as const

type BoardStickyColour = (typeof BOARD_STICKY_COLOURS)[number]
type BoardSectionTint = (typeof BOARD_SECTION_TINTS)[number]

export type { BoardSectionTint, BoardStickyColour }
