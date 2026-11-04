import { useNavigate } from "@tanstack/react-router"

import { librarySearchOf } from "./library-search"

export const useOpenLibraryDocument = () => {
	const navigate = useNavigate()
	return (name: string) =>
		void navigate({
			to: "/library",
			search: librarySearchOf({ kind: "document", name }),
		})
}
