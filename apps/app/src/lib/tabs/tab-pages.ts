import {
	deepEqual,
	defaultParseSearch,
	defaultStringifySearch,
} from "@tanstack/react-router"

import type { LibraryDocumentRenamed, OpenOn } from "../bindings"
import {
	type LibraryOpening,
	librarySearchOf,
	openingOf,
	validateLibrarySearch,
} from "../navigation/library-search"
import { validateSettingsSearch } from "../navigation/settings-search"
import {
	type ThreadSearch,
	validateThreadSearch,
} from "../navigation/thread-search"

export const EMPTY_LIST_HREF = "/"

const LIST_PATH = "/"

export const HREF_BASE = "http://tab"

const LIBRARY_PATH = "/library"

const HOME_PATH = "/home"

const MISSIONS_PATH = "/missions"

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
	libraryOpening?: LibraryOpening
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
		libraryOpening: openingOf(validateLibrarySearch(parsedSearch)),
	}
}

export const isListPage = ({ pathname }: TabPage) => pathname === LIST_PATH

export const isLibraryPage = ({ pathname }: Pick<TabPage, "pathname">) =>
	pathname === LIBRARY_PATH

export const isHomePage = ({ pathname }: Pick<TabPage, "pathname">) =>
	pathname === HOME_PATH

export const isMissionsPage = ({ pathname }: Pick<TabPage, "pathname">) =>
	pathname === MISSIONS_PATH

export type LaunchPage = {
	spaceId: string
	href: string
}

type LaunchChoice = {
	openOn: OpenOn
	lastSpaceId: string | null
}

export const launchPageOf = ({
	openOn,
	lastSpaceId,
}: LaunchChoice): LaunchPage | null =>
	openOn === "lastConversation" || lastSpaceId === null
		? null
		: { spaceId: lastSpaceId, href: HOME_PATH }

export type DocumentRename = Omit<LibraryDocumentRenamed, "spaceId">

const opensDocument = (page: TabPage, name: string) =>
	isLibraryPage(page) &&
	page.libraryOpening?.kind === "document" &&
	page.libraryOpening.name === name

export const hrefAfterRename = (
	href: string,
	{ formerName, name }: DocumentRename,
) => {
	if (!opensDocument(pageOf(href), formerName)) {
		return href
	}
	const { pathname, search, hash } = new URL(href, HREF_BASE)
	const renamedSearch = {
		...defaultParseSearch(search),
		...librarySearchOf({ kind: "document", name }),
	}
	return `${pathname}${defaultStringifySearch(renamedSearch)}${hash}`
}

export const threadRowIdOf = ({ bot, conversation }: ThreadSearch) =>
	bot ?? conversation

export const isTabHref = (href: string) => {
	if (!href.startsWith("/")) {
		return false
	}
	const { pathname } = pageOf(href)
	return (
		pathname === LIST_PATH ||
		pathname === LIBRARY_PATH ||
		pathname === HOME_PATH ||
		pathname === MISSIONS_PATH ||
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

const urlOf = (href: string) => {
	const { pathname, search } = new URL(href, HREF_BASE)
	return { pathname, search: defaultParseSearch(search) }
}

export const sameUrl = (one: string, other: string) =>
	deepEqual(urlOf(one), urlOf(other))

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
