import { useMemo } from "react"

import { UpdateBadge } from "@workspace/ui/components/update-badge"

import { toUpdateBadgeProps } from "./badge-model"
import { useReleaseNotes } from "./use-release-notes"
import type { Updater } from "./use-updater"

import { type ActivityBySpaceId, busyBotCountIn } from "../chat/use-chat"

type UpdateBadgeMount = {
	updater: Updater
	working: ActivityBySpaceId
}

export const useUpdateBadge = ({ updater, working }: UpdateBadgeMount) => {
	const busyBotCount = useMemo(() => busyBotCountIn(working), [working])
	const { releaseNotes } = useReleaseNotes({
		version: updater.state.offeredVersion,
		isWanted: true,
	})
	const notes = releaseNotes?.body

	return useMemo(
		() => (
			<UpdateBadge
				{...toUpdateBadgeProps({
					state: updater.state,
					notes,
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
		[updater.state, updater.controller, notes, busyBotCount],
	)
}
