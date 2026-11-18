import { useEffect, useState } from "react"

import type { LiveHtmlStatus } from "@workspace/ui/components/live-html-slot"
import { i18n } from "@workspace/ui/lib/i18n"

import type { LiveHtmlTheme } from "@/lib/bindings"
import { failureReporterIn } from "@/lib/failure-report"
import {
	createLiveHtmlView,
	type MountLiveHtml,
} from "@/lib/live-html/live-html-view"
import { listenToPageHeight } from "@/lib/live-html/page-height"
import { useIsAppSurfaceOpen } from "@/lib/live-html/use-is-app-surface-open"

const reportFailure = failureReporterIn("use-live-html-view")

type LiveHtmlView = ReturnType<typeof createLiveHtmlView>

const decoded = (still: string) => {
	const image = new Image()
	image.src = still
	return image.decode()
}

const usePageHeight = ({ id, fail }: LiveHtmlView) => {
	const [height, setHeight] = useState<number>()

	useEffect(() => {
		let isListening = true
		const listening = listenToPageHeight(id, (measured) => {
			if (isListening) setHeight(measured)
		}).catch(fail)
		return () => {
			isListening = false
			void listening.then((stopListening) => stopListening?.())
		}
	}, [id, fail])

	return height
}

export const useLiveHtmlView = (
	mountAt: MountLiveHtml,
	theme: LiveHtmlTheme,
	onUnavailable?: () => void,
) => {
	const [status, setStatus] = useState<LiveHtmlStatus>("loading")
	const [still, setStill] = useState<string>()
	const [view] = useState(() =>
		createLiveHtmlView({
			id: crypto.randomUUID(),
			mountAt,
			theme,
			onLive: () => setStatus("live"),
			onFailure: (reason) => {
				setStatus("unavailable")
				onUnavailable?.()
				void reportFailure(
					{ title: i18n.t("chat:liveHtml.failed") },
					{ reason },
				)
			},
			drawStill: (taken) => {
				setStill(taken)
				return decoded(taken)
			},
			dropStill: () => setStill(undefined),
		}),
	)
	const isSurfaceOpen = useIsAppSurfaceOpen(view.isUnder)
	const height = usePageHeight(view)

	const { appearance, hue } = theme

	useEffect(() => view.cover(isSurfaceOpen), [view, isSurfaceOpen])
	useEffect(() => view.wear({ appearance, hue }), [view, appearance, hue])

	return { status, height, still, onPlacementChange: view.follow }
}
