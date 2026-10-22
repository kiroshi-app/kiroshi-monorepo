import { useMemo } from "react"

import { UpdateBadge } from "@workspace/ui/components/update-badge"

import { toUpdateBadgeProps } from "./badge-model"
import type { Updater } from "./use-updater"

import { type ActivityBySpaceId, busyBotCountIn } from "../chat/use-chat"

type UpdateBadgeMount = {
	updater: Updater
	working: ActivityBySpaceId
}

export const useUpdateBadge = ({ updater, working }: UpdateBadgeMount) => {
	const busyBotCount = useMemo(() => busyBotCountIn(working), [working])

	return useMemo(
		() => (
			<UpdateBadge
				{...toUpdateBadgeProps({
					state: updater.state,
					busyBotCount,
				})}
				onDownload={() => {
					void updater.controller.install()
				}}
				onRestart={() => {
					if (busyBotCount === 0) {
						void updater.controller.restart()
					}
				}}
			/>
		),
		[updater.state, updater.controller, busyBotCount],
	)
}
