import { type ClassValue, clsx } from "clsx"
import type { Ref } from "react"
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [{ text: ["compact", "reading"] }],
			h: ["left-column-header"],
			px: ["left-column-inset"],
			rounded: [{ rounded: ["control"] }],
			shadow: [{ shadow: ["popover"] }],
		},
	},
})

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
	return (node: T | null) => {
		for (const ref of refs) {
			if (typeof ref === "function") ref(node)
			else if (ref) ref.current = node
		}
	}
}
