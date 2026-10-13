import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { commands, type HostingState } from "../bindings"

export type HostedSpace = {
	id: string
	name: string
}

export type HostingTransport = {
	read: (spaceId: string) => Promise<HostingState>
	start: (spaceId: string) => Promise<HostingState>
	stop: (spaceId: string) => Promise<HostingState>
}

export type HostingAttempt = {
	isReported: boolean
}

const answerOf = async (
	pending: ReturnType<typeof commands.hostingStart>,
): Promise<HostingState> => {
	const result = await pending
	if (result.status === "error") {
		throw new Error(result.error.kind)
	}
	return result.data
}

export const hostingTransport: HostingTransport = {
	read: commands.hostingState,
	start: (spaceId) => answerOf(commands.hostingStart(spaceId)),
	stop: (spaceId) => answerOf(commands.hostingStop(spaceId)),
}

export const hostingFailureOf = (space: HostedSpace): NoticeMessage => ({
	title: i18n.t("settings:space.hosting.failed.title", { name: space.name }),
	description: i18n.t("settings:space.hosting.failed.description"),
})

export const stopFailureOf = (space: HostedSpace): NoticeMessage => ({
	title: i18n.t("settings:space.hosting.stopFailed.title", {
		name: space.name,
	}),
	description: i18n.t("settings:space.hosting.stopFailed.description"),
})

export const isFailureToReport = (
	previous: HostingState | undefined,
	next: HostingState,
	attempt: HostingAttempt | null,
): boolean => {
	if (next.kind !== "failed") return false
	if (!attempt) return previous?.kind !== "failed"
	if (attempt.isReported) return false
	attempt.isReported = true
	return true
}
