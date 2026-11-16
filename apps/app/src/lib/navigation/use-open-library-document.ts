import { useNavigate, useRouter } from "@tanstack/react-router"

import { type LibraryOpening, librarySearchOf } from "./library-search"

export const useOpenLibraryItem = () => {
	const navigate = useNavigate()
	return (opening: LibraryOpening) =>
		void navigate({ to: "/library", search: librarySearchOf(opening) })
}

export const useOpenLibraryDocument = () => {
	const openItem = useOpenLibraryItem()
	return (name: string) => openItem({ kind: "document", name })
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
