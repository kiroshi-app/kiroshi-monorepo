import { useCallback, useLayoutEffect, useSyncExternalStore } from "react"

import type { ColorScheme } from "@/lib/user/preferences-contract"

type ResolvedScheme = Exclude<ColorScheme, "system">

export type ThemeApplication = {
	colorScheme: ColorScheme
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"

const systemScheme = (): ResolvedScheme =>
	window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"

const resolvedSchemeOf = (colorScheme: ColorScheme): ResolvedScheme =>
	colorScheme === "system" ? systemScheme() : colorScheme

const subscribeToSystemScheme = (onChange: () => void) => {
	const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
	mediaQuery.addEventListener("change", onChange)
	return () => mediaQuery.removeEventListener("change", onChange)
}

export const useResolvedScheme = (colorScheme: ColorScheme): ResolvedScheme => {
	const system = useSyncExternalStore(subscribeToSystemScheme, systemScheme)
	return colorScheme === "system" ? system : colorScheme
}

const disableTransitionsTemporarily = () => {
	const style = document.createElement("style")
	style.appendChild(
		document.createTextNode(
			"*,*::before,*::after{-webkit-transition:none!important;transition:none!important}",
		),
	)
	document.head.appendChild(style)

	return () => {
		window.getComputedStyle(document.body)
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				style.remove()
			})
		})
	}
}

export const useTheme = ({ colorScheme }: ThemeApplication) => {
	const applyTheme = useCallback(() => {
		const root = document.documentElement
		const restoreTransitions = disableTransitionsTemporarily()

		root.classList.remove("light", "dark")
		root.classList.add(resolvedSchemeOf(colorScheme))

		restoreTransitions()
	}, [colorScheme])

	useLayoutEffect(() => {
		applyTheme()

		if (colorScheme !== "system") {
			return undefined
		}

		const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
		mediaQuery.addEventListener("change", applyTheme)

		return () => {
			mediaQuery.removeEventListener("change", applyTheme)
		}
	}, [applyTheme, colorScheme])
}
