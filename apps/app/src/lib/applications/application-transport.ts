import type {
	Application,
	ApplicationInstall,
	ApplicationInstalled,
	ApplicationPort,
	ApplicationSearch,
	InstallRefusal,
} from "./application-port"

import { invoke, listen } from "../host"

export const INSTALLED_EVENT = "application://installed"

export const DIRECTORY_REFRESHED_EVENT = "application://directory-refreshed"

export const applicationTransport: ApplicationPort = {
	catalogue: () => invoke<Application[]>("application_catalogue"),

	search: (query) => invoke<ApplicationSearch>("application_search", { query }),

	named: (name) => invoke<Application | null>("application_named", { name }),

	runnable: (config) =>
		invoke<InstallRefusal | null>("application_runnable", { config }),

	installs: (conversationId) =>
		invoke<ApplicationInstall[]>("application_installs", { conversationId }),

	onInstalled: (listener) =>
		listen<ApplicationInstalled>(INSTALLED_EVENT, ({ payload }) =>
			listener(payload),
		),

	onDirectoryRefreshed: (listener) =>
		listen(DIRECTORY_REFRESHED_EVENT, () => listener()),
}
