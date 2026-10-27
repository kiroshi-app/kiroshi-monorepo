import { useLayoutEffect } from "react"

import {
	type BotAvatarBlot,
	hueOf,
} from "@workspace/ui/components/companion-colour"
import { hueStyle } from "@workspace/ui/components/hue-palette"

const HUE_ATTRIBUTE = "data-hue"

export const useSpaceTint = (colour?: BotAvatarBlot | null) => {
	useLayoutEffect(() => {
		const hue = hueOf(colour)
		if (hue === undefined) {
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
	}, [colour])
}
