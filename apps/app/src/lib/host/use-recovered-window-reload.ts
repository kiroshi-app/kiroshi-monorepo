import { useRef } from "react"

import { i18n } from "@workspace/ui/lib/i18n"

import { reloadRecoveredWindow } from "./window-recovery"

import { raiseReportedFailure } from "@/lib/failure-report"

const raiseReloadFailure = (reason: unknown) =>
	raiseReportedFailure(
		{
			title: i18n.t("common:windowRecovery.gaveUp.reloadFailed.title"),
			description: i18n.t(
				"common:windowRecovery.gaveUp.reloadFailed.description",
			),
		},
		{ raisedIn: "use-recovered-window-reload", reason },
	)

export const useRecoveredWindowReload = () => {
	const isReloading = useRef(false)

	return async () => {
		if (isReloading.current) {
			return
		}
		isReloading.current = true
		try {
			await reloadRecoveredWindow()
		} catch (reason) {
			isReloading.current = false
			await raiseReloadFailure(reason)
		}
	}
}
