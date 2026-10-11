import type {
	Application_Serialize as Application,
	ApplicationInstall_Serialize as ApplicationInstall,
	ApplicationInstalled_Serialize as ApplicationInstalled,
	ApplicationSearch_Serialize as ApplicationSearch,
	InstallRefusal,
} from "@/lib/bindings"

export type {
	Application_Serialize as Application,
	ApplicationInstall_Serialize as ApplicationInstall,
	ApplicationInstalled_Serialize as ApplicationInstalled,
	ApplicationSearch_Serialize as ApplicationSearch,
	ApplicationsError,
	Install,
	InstallCase,
	InstallField,
	InstallRefusal,
} from "@/lib/bindings"

export type ApplicationPort = {
	catalogue: () => Promise<Application[]>
	search: (query: string) => Promise<ApplicationSearch>
	named: (name: string) => Promise<Application | null>
	runnable: (config: Record<string, unknown>) => Promise<InstallRefusal | null>
	installs: (conversationId: string) => Promise<ApplicationInstall[]>
	onInstalled: (
		listener: (installed: ApplicationInstalled) => void,
	) => Promise<() => void>
	onDirectoryRefreshed: (listener: () => void) => Promise<() => void>
}
