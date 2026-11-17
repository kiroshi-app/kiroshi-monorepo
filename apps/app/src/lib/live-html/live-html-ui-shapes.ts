import type { ReactNode } from "react"

import type { LiveHtmlRect } from "@workspace/ui/components/live-html-slot"
import type { MarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import { i18n } from "@workspace/ui/lib/i18n"

export type LiveHtmlGeometry = {
	rect: LiveHtmlRect
	clip: LiveHtmlRect
}

type ReportedSlotGeometry = LiveHtmlGeometry | LiveHtmlRect | null

type HtmlBlockAnswerActions = MarkdownAnswerActions & {
	renderHtmlBlock?: (source: string) => ReactNode
}

const isGeometry = (
	reported: LiveHtmlGeometry | LiveHtmlRect,
): reported is LiveHtmlGeometry => "clip" in reported

const geometryOf = (
	reported: ReportedSlotGeometry,
): LiveHtmlGeometry | null => {
	if (reported === null) return null
	if (isGeometry(reported)) return reported
	return { rect: reported, clip: reported }
}

export const slotGeometryListener =
	(onGeometry: (geometry: LiveHtmlGeometry | null) => void) =>
	(reported: ReportedSlotGeometry) =>
		onGeometry(geometryOf(reported))

export const withHtmlBlock = (
	actions: MarkdownAnswerActions,
	renderHtmlBlock: HtmlBlockAnswerActions["renderHtmlBlock"],
): MarkdownAnswerActions => {
	const extended: HtmlBlockAnswerActions = { ...actions, renderHtmlBlock }
	return extended
}

type PendingKeyTranslator = (key: string) => string

export const liveHtmlFailedTitle = () =>
	(i18n.t as PendingKeyTranslator)("chat:liveHtml.failed")
