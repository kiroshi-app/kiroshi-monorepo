import { useNavigate, useRouter } from "@tanstack/react-router"

import { type LibraryOpening, librarySearchOf } from "./library-search"

import { sameUrl } from "../tabs/tab-pages"
import {
	currentHrefOf,
	openTabOn,
	type SpaceTabs,
	selectTab,
} from "../tabs/tabs-model"
import { shownTabsOf, type WorkspaceTabs } from "../tabs/workspace-tabs"

export const useOpenLibraryDocument = () => {
	const navigate = useNavigate()
	return (name: string) =>
		void navigate({
			to: "/library",
			search: librarySearchOf({ kind: "document", name }),
		})
}

const useLibraryHrefOf = () => {
	const router = useRouter()
	return (opening: LibraryOpening) =>
		router.buildLocation({ to: "/library", search: librarySearchOf(opening) })
			.href
}

export const useOpenLibraryItemInNewTab = () => {
	const router = useRouter()
	const hrefOf = useLibraryHrefOf()
	return (opening: LibraryOpening) =>
		router.options.context.tabs.openInNewTab(hrefOf(opening))
}

const tabShowingIn = (space: SpaceTabs, href: string) =>
	space.tabs.find((tab) => sameUrl(currentHrefOf(tab), href))

const tabShowing = (tabs: WorkspaceTabs, href: string) =>
	tabShowingIn(shownTabsOf(tabs.getState()), href)

type Router = ReturnType<typeof useRouter>

const shownInItsTab = (href: string) => (space: SpaceTabs) => {
	const shown = tabShowingIn(space, href)
	return shown ? selectTab(space, shown.id) : openTabOn(space, href)
}

export const showLibraryItemOfSpace = (
	router: Router,
	spaceRowId: string,
	opening: LibraryOpening,
) => {
	const { href } = router.buildLocation({
		to: "/library",
		search: librarySearchOf(opening),
	})
	router.options.context.tabs.changeSpace(spaceRowId, shownInItsTab(href))
}

const openLibraryItemInItsTab = (router: Router, opening: LibraryOpening) => {
	const { tabs } = router.options.context
	const href = router.buildLocation({
		to: "/library",
		search: librarySearchOf(opening),
	}).href
	if (!tabShowing(tabs, href)) {
		tabs.openInNewTab(href)
	}
	const shown = tabShowing(tabs, href)
	if (shown) {
		tabs.select(shown.id)
	}
}

export const useOpenLibraryItemInItsTab = () => {
	const router = useRouter()
	return (opening: LibraryOpening) => openLibraryItemInItsTab(router, opening)
}
