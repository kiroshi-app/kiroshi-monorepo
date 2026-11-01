import type { ChatDriver } from "./driver"

type SettingsSettled = (botId: string) => Promise<void> | undefined

export const withSettledSettings = (
	driver: ChatDriver,
	settingsSettled: SettingsSettled,
): ChatDriver => ({
	...driver,
	startOrResumeSession: (scope, ...opening) => {
		const open = () => driver.startOrResumeSession(scope, ...opening)
		const settling = settingsSettled(scope.botId)
		return settling ? settling.then(open) : open()
	},
})
