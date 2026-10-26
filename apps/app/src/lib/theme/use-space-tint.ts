import { useLayoutEffect } from "react"

import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/companion-colour"

const TINT_ATTRIBUTE = "data-space-tint"
const TINT_PROPERTY = "--space-tint"

const clearSpaceTint = (root: HTMLElement) => {
	root.removeAttribute(TINT_ATTRIBUTE)
	root.style.removeProperty(TINT_PROPERTY)
}

export const useSpaceTint = (colour?: BotAvatarBlot | null) => {
	useLayoutEffect(() => {
		const root = document.documentElement

		if (!colour) {
			return undefined
		}

		root.setAttribute(TINT_ATTRIBUTE, colour)
		root.style.setProperty(TINT_PROPERTY, blotTint(colour))

		return () => {
			clearSpaceTint(root)
		}
	}, [colour])
}
