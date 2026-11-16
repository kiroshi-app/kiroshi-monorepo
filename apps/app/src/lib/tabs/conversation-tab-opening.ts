import { defaultStringifySearch } from "@tanstack/react-router"

import { i18n } from "@workspace/ui/lib/i18n"

import { EMPTY_LIST_HREF, isHomePage, isListPage, pageOf } from "./tab-pages"
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
	landInActiveTab,
	revealTab,
	type SpaceTabs,
	type Tab,
} from "./tabs-model"
import type { WorkspaceTabs } from "./workspace-tabs"

import { raiseReportedFailure } from "../failure-report"
import { liveWindowLabels, revealWindow } from "../host"
import type { ThreadSearch } from "../navigation/thread-search"

export type ConversationTarget = {
	conversationId: string
	mission?: string
	openInPlace: () => void
}

export type ConversationTabOpening = {
	open: (target: ConversationTarget) => Promise<void>
	openInSpace: (conversationId: string, spaceId: string) => void
	showOverHome: (thread: ThreadSearch, spaceId?: string) => void
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

const threadHrefOf = (thread: ThreadSearch) =>
	`${EMPTY_LIST_HREF}${defaultStringifySearch(thread)}`

const conversationHrefOf = ({
	conversationId,
	mission,
}: Omit<ConversationTarget, "openInPlace">) =>
	threadHrefOf(
		mission === undefined
			? { conversation: conversationId }
			: { conversation: conversationId, mission },
	)

const showsHome = (space: SpaceTabs) =>
	isHomePage(pageOf(currentHrefOf(activeTabOf(space))))

const landOverHome = (href: string) => (space: SpaceTabs) =>
	showsHome(space) ? landInActiveTab(href)(space) : space

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
		const href = conversationHrefOf(target)
		const spaceId = tabs.findSpace(isShowingIn(conversationId))
		if (spaceId !== null) {
			revealHere(spaceId, conversationId, href)
			return
		}
		const mirrored = otherWindowsShowing(tabs.windowLabel, conversationId)
		const windowLabel =
			mirrored.length === 0 ? null : await firstLiveAmong(mirrored)
		if (windowLabel === null) {
			target.openInPlace()
			return
		}
		await askOtherWindow(
			{ windowLabel, conversationId, href },
			target.openInPlace,
		)
	}

	const openInSpace = (conversationId: string, spaceId: string) => {
		tabs.changeSpace(
			spaceId,
			landInActiveTab(conversationHrefOf({ conversationId })),
		)
		showSpace(spaceId)
	}

	const showOverHome = (
		thread: ThreadSearch,
		spaceId = tabs.getState().spaceId,
	) => tabs.changeSpace(spaceId, landOverHome(threadHrefOf(thread)))

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
		openInSpace,
		showOverHome,
		answerReveals: () => watchRevealAsks(tabs.windowLabel, revealAsked),
	}
}
