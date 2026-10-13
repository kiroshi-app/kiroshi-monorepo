import { useEffect } from "react"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"
import type { ConnectionsController } from "../applications/connections-controller"

export type SpaceSettingsReads = {
	applications: Pick<ApplicationsController, "open">
	connections: Pick<ConnectionsController, "open" | "reload">
	spaceId: string | null
	isOpen: boolean
}

export const useSpaceSettingsReads = ({
	applications,
	connections,
	spaceId,
	isOpen,
}: SpaceSettingsReads) => {
	useEffect(() => {
		if (!isOpen || !spaceId) {
			return
		}
		const owner = { kind: "space", id: spaceId } as const
		void applications.open()
		void connections.open(owner)
		return onHostReconnected(() => {
			void applications.open()
			void connections.reload()
		})
	}, [applications, connections, spaceId, isOpen])
}
