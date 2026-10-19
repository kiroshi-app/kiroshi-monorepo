import { type MouseEvent, useEffect, useState } from "react"

import { LATEST_RELEASE_URL, RELEASES_URL } from "./copy"

export type DownloadPlatform = "macos" | "windows" | "linux" | "other"

type ReleaseAsset = {
	name: string
	browser_download_url: string
}

const PLATFORM_ASSET_SUFFIXES: Record<DownloadPlatform, string[]> = {
	macos: ["_aarch64.dmg"],
	windows: ["-setup.exe"],
	linux: [".AppImage", ".deb"],
	other: [],
}

const UPDATER_ASSET_SUFFIXES = [".sig", ".app.tar.gz"]
const UPDATER_MANIFEST = "latest.json"

const detectPlatform = (): DownloadPlatform => {
	const agent = navigator.userAgent
	if (/iPhone|iPad|iPod/.test(agent)) return "other"
	if (/Mac/.test(agent)) return navigator.maxTouchPoints > 1 ? "other" : "macos"
	if (/Win/.test(agent)) return "windows"
	if (/Linux/.test(agent)) return /Android/.test(agent) ? "other" : "linux"
	return "other"
}

const VISITOR_PLATFORM = detectPlatform()

export const isIPhoneVisitor = () => /iPhone|iPod/.test(navigator.userAgent)

const fetchLatestAssets = async () => {
	const response = await fetch(LATEST_RELEASE_URL, {
		headers: { Accept: "application/vnd.github+json" },
	})
	if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
	const release = (await response.json()) as { assets: ReleaseAsset[] }
	return release.assets
}

let latestAssetsRequest: Promise<ReleaseAsset[]> | null = null

const latestAssets = () => {
	latestAssetsRequest ??= fetchLatestAssets()
	return latestAssetsRequest
}

const isDistributable = ({ name }: ReleaseAsset) =>
	name !== UPDATER_MANIFEST &&
	UPDATER_ASSET_SUFFIXES.every((suffix) => !name.endsWith(suffix))

const VISITOR_ASSET_SUFFIXES = PLATFORM_ASSET_SUFFIXES[VISITOR_PLATFORM]

const platformAssetUrl = (assets: ReleaseAsset[]) => {
	const distributables = assets.filter(isDistributable)
	for (const suffix of VISITOR_ASSET_SUFFIXES) {
		const asset = distributables.find(({ name }) => name.endsWith(suffix))
		if (asset) return asset.browser_download_url
	}
	return null
}

const OFFERS_NO_ASSET = VISITOR_ASSET_SUFFIXES.length === 0

const resolvedTarget = () =>
	latestAssets()
		.then((assets) => platformAssetUrl(assets) ?? RELEASES_URL)
		.catch(() => RELEASES_URL)

export const useDownloadTarget = () => {
	const [target, setTarget] = useState<string | null>(
		OFFERS_NO_ASSET ? RELEASES_URL : null,
	)

	useEffect(() => {
		if (OFFERS_NO_ASSET) return
		let listening = true
		resolvedTarget().then((url) => {
			if (listening) setTarget(url)
		})
		return () => {
			listening = false
		}
	}, [])

	const transferOnceResolved = (event: MouseEvent<HTMLAnchorElement>) => {
		if (target !== null) return
		event.preventDefault()
		resolvedTarget().then((url) => {
			window.location.href = url
		})
	}

	return {
		href: target ?? RELEASES_URL,
		onActivate: transferOnceResolved,
		platform: VISITOR_PLATFORM,
	}
}
