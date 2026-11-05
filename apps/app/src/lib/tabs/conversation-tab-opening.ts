import { defaultStringifySearch } from "@tanstack/react-router"

import { i18n } from "@workspace/ui/lib/i18n"

import { EMPTY_LIST_HREF, isListPage, pageOf } from "./tab-pages"
import {
	askReveal,
	type RevealRequest,
	watchRevealAsks,
} from "./tab-reveal-channel"
import {
	keptSpaceIdsOf,
	MAIN_WINDOW_LABEL,
	openWindowLabels,
	readSpaceTabs,
} from "./tabs-mirror"
import {
	activeTabOf,
	currentHrefOf,
	openTabOn,
	revealTab,
	type SpaceTabs,
	type Tab,
} from "./tabs-model"
import type { WorkspaceTabs } from "./workspace-tabs"

import { raiseReportedFailure } from "../failure-report"
import { liveWindowLabels, revealWindow } from "../host"

export type ConversationTarget = {
	conversationId: string
	mission?: string
	openInPlace: () => void
}

export type ConversationTabOpening = {
	open: (target: ConversationTarget) => Promise<void>
	openInNewTab: (conversationId: string, spaceId: string) => void
	answerReveals: () => Promise<() => void>
}

export type ConversationTabOpeningOptions = {
	tabs: Pick<
		WorkspaceTabs,
		"windowLabel" | "getState" | "findSpace" | "changeSpace"
	>
	selectSpace: (spaceId: string) => void
}

const showsConversation = (tab: Tab, conversationId: string) => {
	const page = pageOf(currentHrefOf(tab))
	return isListPage(page) && page.thread.conversation === conversationId
}

const tabShowing = (space: SpaceTabs, conversationId: string) =>
	[activeTabOf(space), ...space.tabs].find((tab) =>
		showsConversation(tab, conversationId),
	)

const isShowingIn = (conversationId: string) => (space: SpaceTabs) =>
	tabShowing(space, conversationId) !== undefined

const revealShowing =
	(conversationId: string, href: string) => (space: SpaceTabs) => {
		const tab = tabShowing(space, conversationId)
		return tab ? revealTab(space, tab.id, href) : space
	}

const hrefOf = ({
	conversationId,
	mission,
}: Omit<ConversationTarget, "openInPlace">) =>
	`${EMPTY_LIST_HREF}${defaultStringifySearch(
		mission === undefined
			? { conversation: conversationId }
			: { conversation: conversationId, mission },
	)}`

const isWindowShowing = (windowLabel: string, conversationId: string) =>
	keptSpaceIdsOf(windowLabel).some((spaceId) => {
		const space = readSpaceTabs(windowLabel, spaceId)
		return space !== null && tabShowing(space, conversationId) !== undefined
	})

const otherWindowsShowing = (windowLabel: string, conversationId: string) =>
	[MAIN_WINDOW_LABEL, ...openWindowLabels()].filter(
		(label) => label !== windowLabel && isWindowShowing(label, conversationId),
	)

const reportUnreadWindows = (reason: unknown): string[] => {
	console.error(
		"conversation opening: the open windows could not be read",
		reason,
	)
	return []
}

const firstLiveAmong = async (windowLabels: string[]) => {
	const liveLabels = await liveWindowLabels().catch(reportUnreadWindows)
	return windowLabels.find((label) => liveLabels.includes(label)) ?? null
}

const raiseRevealFailure = () =>
	raiseReportedFailure(
		{
			title: i18n.t("common:titleBar.revealTabFailed.title"),
			description: i18n.t("common:titleBar.revealTabFailed.description"),
		},
		{ raisedIn: "conversation-tab-opening" },
	)

export const createConversationTabOpening = ({
	tabs,
	selectSpace,
}: ConversationTabOpeningOptions): ConversationTabOpening => {
	const showSpace = (spaceId: string) => {
		if (spaceId !== tabs.getState().spaceId) {
			selectSpace(spaceId)
		}
	}

	const revealHere = (
		spaceId: string,
		conversationId: string,
		href: string,
	) => {
		tabs.changeSpace(spaceId, revealShowing(conversationId, href))
		showSpace(spaceId)
	}

	const askOtherWindow = (request: RevealRequest, openInPlace: () => void) =>
		askReveal(request).then((isRevealed) => {
			if (!isRevealed) {
				openInPlace()
			}
		}, raiseRevealFailure)

	const open = async (target: ConversationTarget) => {
		const { conversationId } = target
		const href = hrefOf(target)
		const spaceId = tabs.findSpace(isShowingIn(conversationId))
		if (spaceId !== null) {
			revealHere(spaceId, conversationId, href)
			return
		}
		const mirrored = otherWindowsShowing(tabs.windowLabel, conversationId)
		if (mirrored.length === 0) {
			target.openInPlace()
			return
		}
		const windowLabel = await firstLiveAmong(mirrored)
		if (windowLabel === null) {
			target.openInPlace()
			return
		}
		await askOtherWindow(
			{ windowLabel, conversationId, href },
			target.openInPlace,
		)
	}

	const openInNewTab = (conversationId: string, spaceId: string) => {
		const href = hrefOf({ conversationId })
		tabs.changeSpace(spaceId, (space) => openTabOn(space, href))
		showSpace(spaceId)
	}

	const revealAsked = async ({ conversationId, href }: RevealRequest) => {
		const spaceId = tabs.findSpace(isShowingIn(conversationId))
		if (spaceId === null) {
			return false
		}
		await revealWindow({ withFocus: true })
		revealHere(spaceId, conversationId, href)
		return true
	}

	return {
		open,
		openInNewTab,
		answerReveals: () => watchRevealAsks(tabs.windowLabel, revealAsked),
	}
}
