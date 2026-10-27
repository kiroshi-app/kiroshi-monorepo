import { defaultParseSearch } from "@tanstack/react-router"

import { validateSettingsSearch } from "../navigation/settings-search"
import {
	type ThreadSearch,
	validateThreadSearch,
} from "../navigation/thread-search"

export const EMPTY_LIST_HREF = "/"

const LIST_PATH = "/"

export const HREF_BASE = "http://tab"

const USER_SETTINGS_PATH = "/settings/user"

const SPACE_SETTINGS_PATH = /^\/settings\/space\/[^/]+$/

const COMPANION_SETTINGS_PATH = /^\/settings\/companion\/([^/]+)$/

const CONVERSATION_SETTINGS_PATH = /^\/settings\/conversation\/([^/]+)$/

export type TabPage = {
	pathname: string
	thread: ThreadSearch
	companionId?: string
	conversationId?: string
	entry?: string
	application?: string
}

const idIn = (path: RegExp, pathname: string) => {
	const matched = path.exec(pathname)
	return matched?.[1] === undefined ? undefined : decodeURIComponent(matched[1])
}

const companionIdIn = (pathname: string) =>
	idIn(COMPANION_SETTINGS_PATH, pathname)

const conversationIdIn = (pathname: string) =>
	idIn(CONVERSATION_SETTINGS_PATH, pathname)

export const pageOf = (href: string): TabPage => {
	const { pathname, search } = new URL(href, HREF_BASE)
	const parsedSearch = defaultParseSearch(search)
	const { entry, application } = validateSettingsSearch(parsedSearch)
	return {
		pathname,
		thread: validateThreadSearch(parsedSearch),
		companionId: companionIdIn(pathname),
		conversationId: conversationIdIn(pathname),
		entry,
		application,
	}
}

export const isListPage = ({ pathname }: TabPage) => pathname === LIST_PATH

export const threadRowIdOf = ({ bot, conversation }: ThreadSearch) =>
	bot ?? conversation

export const isTabHref = (href: string) => {
	if (!href.startsWith("/")) {
		return false
	}
	const { pathname } = pageOf(href)
	return (
		pathname === LIST_PATH ||
		pathname === USER_SETTINGS_PATH ||
		SPACE_SETTINGS_PATH.test(pathname) ||
		companionIdIn(pathname) !== undefined ||
		conversationIdIn(pathname) !== undefined
	)
}

export const sameThread = (one: ThreadSearch, other: ThreadSearch) =>
	one.bot === other.bot &&
	one.conversation === other.conversation &&
	one.mission === other.mission

export const rowIdsNamedBy = (href: string) => {
	const { thread, companionId, conversationId } = pageOf(href)
	return [threadRowIdOf(thread), companionId, conversationId].filter(
		(id): id is string => id !== undefined,
	)
}

export type SettingsTarget = "user" | "space" | "companion" | "conversation"

export const settingsTargetOf = ({
	pathname,
	companionId,
	conversationId,
}: TabPage): SettingsTarget => {
	if (companionId !== undefined) {
		return "companion"
	}
	if (conversationId !== undefined) {
		return "conversation"
	}
	return pathname === USER_SETTINGS_PATH ? "user" : "space"
}
