import { relaunch } from "@tauri-apps/plugin-process"

import type { HostUpdateState, UpdaterPort } from "./updater-port"

import { commands, UPDATE_CHANGED_EVENT } from "../bindings"
import { listen } from "../host/tauri"

export const updaterTransport: UpdaterPort = {
	check: () => commands.checkForUpdates(),

	install: () => commands.installUpdate(),

	countRunningCompanions: () => commands.runningCompanions(),

	restart: () => relaunch(),

	watch: (onChange) =>
		listen<HostUpdateState>(UPDATE_CHANGED_EVENT, ({ payload }) =>
			onChange(payload),
		),
}
