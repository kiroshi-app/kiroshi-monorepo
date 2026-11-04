import { useNavigate, useRouter } from "@tanstack/react-router"

import { type LibraryOpening, librarySearchOf } from "./library-search"

export const useOpenLibraryDocument = () => {
	const navigate = useNavigate()
	return (name: string) =>
		void navigate({
			to: "/library",
			search: librarySearchOf({ kind: "document", name }),
		})
}

export const useLibraryHrefOf = () => {
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
