import type { ChatDriver } from "./driver"

type SettingsSettled = (botId: string) => Promise<void>

export const withSettledSettings = (
	driver: ChatDriver,
	settingsSettled: SettingsSettled,
): ChatDriver => ({
	...driver,
	startOrResumeSession: async (scope, ...opening) => {
		await settingsSettled(scope.botId)
		return driver.startOrResumeSession(scope, ...opening)
	},
})
