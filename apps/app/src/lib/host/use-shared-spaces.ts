import { useEffect } from "react"

import type { Space } from "@workspace/ui/components/space"

import { isDesktopHost } from "./index"
import { createSharedSpacesController } from "./shared-spaces-controller"

import { useController } from "../use-controller"

const ID_SEPARATOR = "\n"

export const useSharedSpaces = (spaces: Pick<Space, "id">[]) => {
	const { state, controller } = useController(createSharedSpacesController)
	const watchedIds = spaces.map((space) => space.id).join(ID_SEPARATOR)

	useEffect(
		() =>
			isDesktopHost() && watchedIds
				? controller.watch(watchedIds.split(ID_SEPARATOR))
				: undefined,
		[controller, watchedIds],
	)

	return state.sharedBySpaceId
}
