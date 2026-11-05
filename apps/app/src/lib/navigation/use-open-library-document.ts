import { useNavigate, useRouter } from "@tanstack/react-router"

import { type LibraryOpening, librarySearchOf } from "./library-search"

import { sameUrl } from "../tabs/tab-pages"
import { currentHrefOf } from "../tabs/tabs-model"
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

const tabShowing = (tabs: WorkspaceTabs, href: string) =>
	shownTabsOf(tabs.getState()).tabs.find((tab) =>
		sameUrl(currentHrefOf(tab), href),
	)

export const useOpenLibraryItemInItsTab = () => {
	const router = useRouter()
	const hrefOf = useLibraryHrefOf()
	return (opening: LibraryOpening) => {
		const { tabs } = router.options.context
		const href = hrefOf(opening)
		if (!tabShowing(tabs, href)) {
			tabs.openInNewTab(href)
		}
		const shown = tabShowing(tabs, href)
		if (shown) {
			tabs.select(shown.id)
		}
	}
}
