import { useNavigate } from "@tanstack/react-router"

import { librarySearchOf } from "./library-search"

export const useOpenLibraryImage = () => {
	const navigate = useNavigate()
	return (name: string) =>
		void navigate({
			to: "/library",
			search: librarySearchOf({ kind: "image", name }),
		})
}
