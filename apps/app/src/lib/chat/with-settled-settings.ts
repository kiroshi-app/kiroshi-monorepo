import type { ChatDriver } from "./driver"

type SettingsSettled = (botId: string) => Promise<void> | undefined

export const withSettledSettings = (
	driver: ChatDriver,
	settingsSettled: SettingsSettled,
): ChatDriver => ({
	...driver,
	startOrResumeSession: (scope, ...opening) => {
		const settling = settingsSettled(scope.botId)
		if (!settling) {
			return driver.startOrResumeSession(scope, ...opening)
		}
		return settling.then(() => driver.startOrResumeSession(scope, ...opening))
	},
})
