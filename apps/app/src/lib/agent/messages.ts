import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { TransportError } from "./contract"

type Crash = Extract<TransportError, { kind: "crashed" }>

function describeCrash(t: ChatCopy, { code, detail }: Crash): string {
	if (code === null) {
		return detail
			? t("screen.transport.crashedUnknownCodeDetail", { detail })
			: t("screen.transport.crashedUnknownCode")
	}
	return detail
		? t("screen.transport.crashedDetail", { code, detail })
		: t("screen.transport.crashed", { code })
}

export const agentNameOf = (name: string | undefined): string | undefined =>
	name?.trim() || undefined

const describeNamedCrash = (
	t: ChatCopy,
	{ code, detail }: Crash,
	name: string,
): string => {
	if (code === null) {
		return detail
			? t("screen.transport.crashedUnknownCodeDetailNamed", { name, detail })
			: t("screen.transport.crashedUnknownCodeNamed", { name })
	}
	return detail
		? t("screen.transport.crashedDetailNamed", { name, code, detail })
		: t("screen.transport.crashedNamed", { name, code })
}

const describeNamedTransportError = (
	t: ChatCopy,
	error: TransportError,
	name: string,
): string | null => {
	switch (error.kind) {
		case "binaryNotFound":
			return t("screen.transport.binaryNotFoundNamed", { name })
		case "spawnFailed":
			return t("screen.transport.spawnFailedNamed", {
				name,
				detail: error.detail,
			})
		case "startupTimeout":
			return t("screen.transport.startupTimeoutNamed", {
				name,
				timeoutMs: error.timeoutMs,
			})
		case "crashed":
			return describeNamedCrash(t, error, name)
		case "resumeFailed":
			return t("screen.transport.resumeFailedNamed", { name })
		case "runLapsed":
			return error.lapse === "silent"
				? t("screen.transport.runLapsedSilentNamed", { name })
				: t("screen.transport.runLapsedInterruptNamed", { name })
		default:
			return null
	}
}

const describeUnnamedTransportError = (
	t: ChatCopy,
	error: TransportError,
): string => {
	switch (error.kind) {
		case "binaryNotFound":
			return t("screen.transport.binaryNotFound")
		case "notAuthenticated":
			return t("screen.transport.notAuthenticated")
		case "authCheckFailed":
			return t("screen.transport.authCheckFailed", { detail: error.detail })
		case "spawnFailed":
			return t("screen.transport.spawnFailed", { detail: error.detail })
		case "startupTimeout":
			return t("screen.transport.startupTimeout", {
				timeoutMs: error.timeoutMs,
			})
		case "crashed":
			return describeCrash(t, error)
		case "resumeFailed":
			return t("screen.transport.resumeFailed")
		case "invalidFrame":
			return t("screen.transport.invalidFrame", { detail: error.detail })
		case "settingsRejected":
			return t("screen.transport.settingsRejected", { detail: error.detail })
		case "serverEnvRejected":
			return t("screen.transport.serverEnvRejected", { detail: error.detail })
		case "notStarted":
			return t("screen.transport.notStarted")
		case "turnAlreadyRunning":
			return t("screen.transport.turnAlreadyRunning")
		case "transitionInProgress":
			return t("screen.transport.transitionInProgress")
		case "noActiveTurn":
			return t("screen.transport.noActiveTurn")
		case "staleRuntimeSession":
			return t("screen.transport.staleRuntimeSession")
		case "unknownPermission":
			return t("screen.transport.unknownPermission", { id: error.id })
		case "writeFailed":
			return t("screen.transport.writeFailed", { detail: error.detail })
		case "runLapsed":
			return error.lapse === "silent"
				? t("screen.transport.runLapsedSilent")
				: t("screen.transport.runLapsedInterrupt")
		case "readFailed":
			return t("screen.transport.readFailed", { detail: error.detail })
		case "unknownFailure":
			return t("screen.transport.unknownFailure", { detail: error.detail })
		case "hostOffline":
			return t("screen.notice.hostOffline.description")
	}
}

export const describeTransportError = (
	t: ChatCopy,
	error: TransportError,
	agentName?: string,
): string => {
	const name = agentNameOf(agentName)
	return (
		(name && describeNamedTransportError(t, error, name)) ||
		describeUnnamedTransportError(t, error)
	)
}
