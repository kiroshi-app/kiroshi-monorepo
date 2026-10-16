import type { UpdaterPort } from "./updater-port"
import { updaterTransport } from "./updater-transport"

import { isDesktopHost } from "../host"

const UP_TO_DATE = { kind: "upToDate" } as const

const browserUpdater: UpdaterPort = {
	check: async () => UP_TO_DATE,
	install: async () => UP_TO_DATE,
	countRunningCompanions: async () => 0,
	restart: async () => undefined,
	watch: async () => () => undefined,
}

export const createUpdater = (): UpdaterPort =>
	isDesktopHost() ? updaterTransport : browserUpdater
