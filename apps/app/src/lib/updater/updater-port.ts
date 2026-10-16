import type { UpdateState as HostUpdateState } from "../bindings"

export type { HostUpdateState }

type StopWatching = () => void

export type UpdaterPort = {
	check: () => Promise<HostUpdateState>
	install: () => Promise<HostUpdateState>
	countRunningCompanions: () => Promise<number>
	restart: () => Promise<void>
	watch: (onChange: (state: HostUpdateState) => void) => Promise<StopWatching>
}
