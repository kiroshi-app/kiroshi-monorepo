export const EASE_OUT = [0.23, 1, 0.32, 1] as const

export const TRANSITION_NONE = { duration: 0 } as const

export const SPRING_SWAP = {
	type: "spring",
	stiffness: 460,
	damping: 30,
	mass: 0.55,
} as const

export const SPRING_PANEL = {
	type: "spring",
	stiffness: 420,
	damping: 40,
	mass: 0.5,
} as const

export const SPRING_LAYOUT = {
	type: "spring",
	stiffness: 360,
	damping: 32,
	mass: 0.6,
} as const
