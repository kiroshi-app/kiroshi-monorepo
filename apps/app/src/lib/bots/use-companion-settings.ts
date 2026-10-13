import { useEffect } from "react"

import { onHostReconnected } from "../host"
import type { ApplicationsController } from "../applications/applications-controller"
import { botPlugin } from "../conversations/plugin-scope"
import type { PluginController } from "../plugins/plugin-controller"

export type CompanionSettings = {
	applications: Pick<ApplicationsController, "open">
	plugin: Pick<PluginController, "open" | "reload">
	companionId: string | null
	spaceId: string | null
	isOpen: boolean
}

export const useCompanionSettings = ({
	applications,
	plugin,
	companionId,
	spaceId,
	isOpen,
}: CompanionSettings) => {
	useEffect(() => {
		if (!isOpen || !companionId || !spaceId) {
			return
		}
		void applications.open()
		void plugin.open(botPlugin(companionId))
		return onHostReconnected(() => {
			void applications.open()
			plugin.reload()
		})
	}, [applications, plugin, companionId, spaceId, isOpen])
}
