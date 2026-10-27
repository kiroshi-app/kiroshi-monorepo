import { openUrl } from "@tauri-apps/plugin-opener"
import { useEffect } from "react"

import { isDesktopHost } from "../host"

const WEB_SCHEMES = ["http:", "https:"]

const EXTERNAL_SCHEMES = new Set([...WEB_SCHEMES, "mailto:", "tel:"])

const urlOf = (href: string, base?: string): URL | null => {
	try {
		return new URL(href, base)
	} catch {
		return null
	}
}

export const externalUrlOf = (
	href: string | null | undefined,
	pageUrl: string,
): string | null => {
	const url = href ? urlOf(href, pageUrl) : null
	if (!url || !EXTERNAL_SCHEMES.has(url.protocol)) {
		return null
	}
	const page = urlOf(pageUrl)
	if (WEB_SCHEMES.includes(url.protocol) && url.origin === page?.origin) {
		return null
	}
	return url.href
}

export const inAppHrefOf = (
	href: string | null | undefined,
	pageUrl: string,
): string | null => {
	const url = href ? urlOf(href, pageUrl) : null
	const page = urlOf(pageUrl)
	if (!url || url.protocol !== page?.protocol || url.host !== page.host) {
		return null
	}
	return `${url.pathname}${url.search}${url.hash}`
}

export const openInBrowser = async (href: string | null): Promise<void> => {
	const url = externalUrlOf(href, window.location.href)
	if (!url) {
		throw new Error(`not an external address: ${href}`)
	}
	if (isDesktopHost()) {
		await openUrl(url)
		return
	}
	window.open(url, "_blank", "noopener,noreferrer")
}

export const anchorOf = (target: EventTarget | null) =>
	target instanceof Element ? target.closest("a[href]") : null

export const useExternalLinks = () => {
	useEffect(() => {
		if (!isDesktopHost()) return

		const openInBrowser = (event: MouseEvent) => {
			if (event.defaultPrevented) return

			const url = externalUrlOf(
				anchorOf(event.target)?.getAttribute("href"),
				window.location.href,
			)
			if (!url) return

			event.preventDefault()
			openUrl(url).catch(() => undefined)
		}

		document.addEventListener("click", openInBrowser)
		return () => document.removeEventListener("click", openInBrowser)
	}, [])
}
