import { useEffect, useState } from "react"

import type { LiveHtmlStatus } from "@workspace/ui/components/live-html-slot"
import { i18n } from "@workspace/ui/lib/i18n"

import { failureReporterIn } from "@/lib/failure-report"
import { createLiveHtmlView } from "@/lib/live-html/live-html-view"
import { useIsAppSurfaceOpen } from "@/lib/live-html/use-is-app-surface-open"

const reportFailure = failureReporterIn("use-live-html-view")

export const useLiveHtmlView = (html: string) => {
	const [status, setStatus] = useState<LiveHtmlStatus>("loading")
	const [view] = useState(() =>
		createLiveHtmlView({
			id: crypto.randomUUID(),
			html,
			onLive: () => setStatus("live"),
			onFailure: (reason) => {
				setStatus("unavailable")
				void reportFailure(
					{ title: i18n.t("chat:liveHtml.failed") },
					{ reason },
				)
			},
		}),
	)
	const isSurfaceOpen = useIsAppSurfaceOpen()

	useEffect(() => view.cover(isSurfaceOpen), [view, isSurfaceOpen])

	return { status, onPlacementChange: view.follow }
}
