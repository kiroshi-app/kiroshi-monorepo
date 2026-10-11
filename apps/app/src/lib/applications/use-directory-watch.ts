import { useEffect } from "react"

import type { ApplicationsController } from "./applications-controller"

export const useDirectoryWatch = (
	controller: ApplicationsController,
	isCatalogueViewOpen: boolean,
) => {
	useEffect(() => {
		if (!isCatalogueViewOpen) {
			return
		}
		return controller.stopWatchingDirectory
	}, [controller, isCatalogueViewOpen])
}
