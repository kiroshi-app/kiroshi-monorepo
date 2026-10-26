import { useLayoutEffect } from "react"

import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/companion-colour"

const TINT_ATTRIBUTE = "data-space-tint"
const TINT_PROPERTY = "--space-tint"

export const useSpaceTint = (colour?: BotAvatarBlot | null) => {
	useLayoutEffect(() => {
		if (!colour) {
			return undefined
		}

		const root = document.documentElement
		root.setAttribute(TINT_ATTRIBUTE, colour)
		root.style.setProperty(TINT_PROPERTY, blotTint(colour))

		return () => {
			root.removeAttribute(TINT_ATTRIBUTE)
			root.style.removeProperty(TINT_PROPERTY)
		}
	}, [colour])
}
