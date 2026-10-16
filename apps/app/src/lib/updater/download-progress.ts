import type { HostUpdateState } from "./updater-port"

export const downloadedPercentOf = (host: HostUpdateState): number =>
	host.kind === "downloading" && host.totalBytes
		? Math.floor((host.downloadedBytes / host.totalBytes) * 100)
		: 0
