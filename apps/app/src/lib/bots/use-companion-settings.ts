import { useEffect } from "react"

import { onHostReconnected } from "../host"
import { botPlugin } from "../conversations/plugin-scope"
import type { PluginController } from "../plugins/plugin-controller"

export type CompanionSettings = {
	plugin: Pick<PluginController, "open" | "reload">
	companionId: string | null
	spaceId: string | null
	isOpen: boolean
}

export const useCompanionSettings = ({
	plugin,
	companionId,
	spaceId,
	isOpen,
}: CompanionSettings) => {
	useEffect(() => {
		if (!isOpen || !companionId || !spaceId) {
			return
		}
		void plugin.open(botPlugin(companionId))
		return onHostReconnected(() => {
			plugin.reload()
		})
	}, [plugin, companionId, spaceId, isOpen])
}
