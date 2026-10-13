import { useEffect } from "react"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"
import type { ConnectionsController } from "../applications/connections-controller"
import type { McpServersController } from "../bots/mcp-servers-controller"

export type SpaceSettingsReads = {
	applications: Pick<ApplicationsController, "open">
	servers: Pick<McpServersController, "open" | "reload">
	connections: Pick<ConnectionsController, "open" | "reload">
	spaceId: string | null
	isOpen: boolean
}

export const useSpaceSettingsReads = ({
	applications,
	servers,
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
		void servers.open(owner)
		void connections.open(owner)
		return onHostReconnected(() => {
			void applications.open()
			void servers.reload()
			void connections.reload()
		})
	}, [applications, servers, connections, spaceId, isOpen])
}
