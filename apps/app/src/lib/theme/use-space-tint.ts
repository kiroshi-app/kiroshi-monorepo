import { useLayoutEffect } from "react"

import { hueStyle } from "@workspace/ui/components/hue-palette"

import type { Hue } from "@/lib/bindings"

const HUE_ATTRIBUTE = "data-hue"

export const useSpaceTint = (hue?: Hue | null) => {
	useLayoutEffect(() => {
		if (hue == null) {
			return undefined
		}

		const root = document.documentElement
		const properties = Object.entries(hueStyle(hue))
		root.setAttribute(HUE_ATTRIBUTE, String(hue))
		for (const [property, value] of properties) {
			root.style.setProperty(property, value)
		}

		return () => {
			root.removeAttribute(HUE_ATTRIBUTE)
			for (const [property] of properties) {
				root.style.removeProperty(property)
			}
		}
	}, [hue])
}
