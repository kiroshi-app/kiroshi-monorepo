import { useEffect } from "react"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"

export type SpaceSettingsReads = {
	applications: Pick<ApplicationsController, "open">
	spaceId: string | null
	isOpen: boolean
}

export const useSpaceSettingsReads = ({
	applications,
	spaceId,
	isOpen,
}: SpaceSettingsReads) => {
	useEffect(() => {
		if (!isOpen || !spaceId) {
			return
		}
		void applications.open()
		return onHostReconnected(() => {
			void applications.open()
		})
	}, [applications, spaceId, isOpen])
}
