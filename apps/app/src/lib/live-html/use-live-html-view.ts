import { useContext, useEffect, useState } from "react"

import type { LiveHtmlStatus } from "@workspace/ui/components/live-html-slot"
import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { LiveHtmlError, LiveHtmlTheme } from "@/lib/bindings"
import { describeFailure, failureReporterIn } from "@/lib/failure-report"
import { isExpectedRefusal } from "@/lib/live-html/live-html-refusal"
import {
	createLiveHtmlView,
	type MountLiveHtml,
} from "@/lib/live-html/live-html-view"
import { listenToPageHeight } from "@/lib/live-html/page-height"
import { listenToPageLoad } from "@/lib/live-html/page-load"
import { useIsAppSurfaceOpen } from "@/lib/live-html/use-is-app-surface-open"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

const RAISED_IN = "use-live-html-view"

const reportFailure = failureReporterIn(RAISED_IN)

type LiveHtmlView = ReturnType<typeof createLiveHtmlView>

export type LiveHtmlViewNeeds = {
	refusalNotice: string
	onFailed?: () => void
}

const decoded = (still: string) => {
	const image = new Image()
	image.src = still
	return image.decode()
}

const logRefusalOffScreen = (refusal: LiveHtmlError) => {
	console.warn(
		[
			`${RAISED_IN}: a live view was refused in a Space not on screen`,
			`reason: ${describeFailure(refusal)}`,
		].join(" | "),
	)
}

const tellRefusal = (
	refusal: LiveHtmlError,
	refusalNotice: string,
	isViewSpaceOnScreen: () => boolean,
) => {
	if (!isViewSpaceOnScreen()) {
		logRefusalOffScreen(refusal)
		return
	}
	raiseTransientNotice({ type: "warning", title: refusalNotice })
}

const reportUnexpectedFailure = (reason: unknown, onFailed?: () => void) => {
	onFailed?.()
	void reportFailure({ title: i18n.t("chat:liveHtml.failed") }, { reason })
}

const useIsViewSpaceOnScreen = () => {
	const roster = useContext(WorkspaceContext)?.core.roster.controller
	const [isViewSpaceOnScreen] = useState(() => {
		const viewSpaceRowId = roster?.getState().spaceRowId
		return () => !roster || roster.getState().spaceRowId === viewSpaceRowId
	})
	return isViewSpaceOnScreen
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

const liveOnceLoaded = (status: LiveHtmlStatus): LiveHtmlStatus =>
	status === "loading" ? "live" : status

const usePageLoad = (
	{ id, fail }: LiveHtmlView,
	setStatus: (next: (status: LiveHtmlStatus) => LiveHtmlStatus) => void,
) => {
	useEffect(() => {
		let isListening = true
		const listening = listenToPageLoad(id, (failure) => {
			if (!isListening) return
			if (failure) fail(failure)
			else setStatus(liveOnceLoaded)
		}).catch(fail)
		return () => {
			isListening = false
			void listening.then((stopListening) => stopListening?.())
		}
	}, [id, fail, setStatus])
}

export const useLiveHtmlView = (
	mountAt: MountLiveHtml,
	theme: LiveHtmlTheme,
	{ refusalNotice, onFailed }: LiveHtmlViewNeeds,
) => {
	const [status, setStatus] = useState<LiveHtmlStatus>("loading")
	const [still, setStill] = useState<string>()
	const isViewSpaceOnScreen = useIsViewSpaceOnScreen()
	const [view] = useState(() =>
		createLiveHtmlView({
			id: crypto.randomUUID(),
			mountAt,
			theme,
			onFailure: (reason) => {
				setStatus("unavailable")
				if (isExpectedRefusal(reason)) {
					tellRefusal(reason, refusalNotice, isViewSpaceOnScreen)
				} else {
					reportUnexpectedFailure(reason, onFailed)
				}
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
	usePageLoad(view, setStatus)

	const { appearance, hue } = theme

	useEffect(() => view.cover(isSurfaceOpen), [view, isSurfaceOpen])
	useEffect(() => view.wear({ appearance, hue }), [view, appearance, hue])

	return { status, height, still, onPlacementChange: view.follow }
}
