import { useEffect } from "react"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { JoinedSpacesController } from "./joined-spaces-controller"

export type LeftSpace = {
	id: string
	name: string
	host: string
}

const raiseLeftNotice = ({ name, host }: LeftSpace) =>
	raiseTransientNotice({
		title: i18n.t("settings:screen.space.left.title", { name }),
		description: i18n.t("settings:screen.space.left.description", { host }),
	})

const isHeldIn = (controller: JoinedSpacesController, id: string) =>
	controller.getState().joinedSpaces.some((joined) => joined.id === id)

export const useLeftSpaceNotice = (
	controller: JoinedSpacesController,
	shown: LeftSpace | undefined,
) => {
	const id = shown?.id
	const name = shown?.name
	const host = shown?.host

	useEffect(() => {
		if (id === undefined || name === undefined || host === undefined) return
		let hasLeft = false
		return controller.subscribe(() => {
			if (hasLeft || isHeldIn(controller, id)) return
			hasLeft = true
			raiseLeftNotice({ id, name, host })
		})
	}, [controller, id, name, host])
}
