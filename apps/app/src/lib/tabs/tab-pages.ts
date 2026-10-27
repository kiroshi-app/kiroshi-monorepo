import { defaultParseSearch } from "@tanstack/react-router"

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

export type TabPage = {
	pathname: string
	thread: ThreadSearch
	companionId?: string
}

const companionIdIn = (pathname: string) => {
	const matched = COMPANION_SETTINGS_PATH.exec(pathname)
	return matched?.[1] === undefined ? undefined : decodeURIComponent(matched[1])
}

export const pageOf = (href: string): TabPage => {
	const { pathname, search } = new URL(href, HREF_BASE)
	return {
		pathname,
		thread: validateThreadSearch(defaultParseSearch(search)),
		companionId: companionIdIn(pathname),
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
		companionIdIn(pathname) !== undefined
	)
}

export const sameThread = (one: ThreadSearch, other: ThreadSearch) =>
	one.bot === other.bot &&
	one.conversation === other.conversation &&
	one.mission === other.mission

export const rowIdsNamedBy = (href: string) => {
	const { thread, companionId } = pageOf(href)
	return [threadRowIdOf(thread), companionId].filter(
		(id): id is string => id !== undefined,
	)
}

export type SettingsTarget = "user" | "space" | "companion"

export const settingsTargetOf = ({
	pathname,
	companionId,
}: TabPage): SettingsTarget => {
	if (companionId !== undefined) {
		return "companion"
	}
	return pathname === USER_SETTINGS_PATH ? "user" : "space"
}
