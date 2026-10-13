import { useEffect } from "react"

import type { McpServersController } from "./mcp-servers-controller"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"
import type { ConnectionsController } from "../applications/connections-controller"
import { botPlugin } from "../conversations/plugin-scope"
import type { PluginController } from "../plugins/plugin-controller"

export type CompanionSettings = {
	applications: Pick<ApplicationsController, "open">
	plugin: Pick<PluginController, "open" | "reload">
	servers: Pick<McpServersController, "open" | "reload">
	connections: Pick<ConnectionsController, "open" | "reload">
	companionId: string | null
	spaceId: string | null
	isOpen: boolean
}

export const useCompanionSettings = ({
	applications,
	plugin,
	servers,
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
		void servers.open(owner)
		void connections.open(owner)
		return onHostReconnected(() => {
			void applications.open()
			plugin.reload()
			void servers.reload()
			void connections.reload()
		})
	}, [applications, plugin, servers, connections, companionId, spaceId, isOpen])
}
