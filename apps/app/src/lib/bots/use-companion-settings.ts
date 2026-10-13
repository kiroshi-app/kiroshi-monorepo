import { useEffect } from "react"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"
import type { ConnectionsController } from "../applications/connections-controller"
import { botPlugin } from "../conversations/plugin-scope"
import type { PluginController } from "../plugins/plugin-controller"

export type CompanionSettings = {
	applications: Pick<ApplicationsController, "open">
	plugin: Pick<PluginController, "open" | "reload">
	connections: Pick<ConnectionsController, "open" | "reload">
	companionId: string | null
	spaceId: string | null
	isOpen: boolean
}

export const useCompanionSettings = ({
	applications,
	plugin,
	connections,
	companionId,
	spaceId,
	isOpen,
}: CompanionSettings) => {
	useEffect(() => {
		if (!isOpen || !companionId || !spaceId) {
			return
		}
		const owner = { kind: "bot", id: companionId, spaceId } as const
		void applications.open()
		void plugin.open(botPlugin(companionId))
		void connections.open(owner)
		return onHostReconnected(() => {
			void applications.open()
			plugin.reload()
			void connections.reload()
		})
	}, [applications, plugin, connections, companionId, spaceId, isOpen])
}
