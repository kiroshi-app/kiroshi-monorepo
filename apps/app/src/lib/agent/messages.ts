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

export function describeTransportError(
	t: ChatCopy,
	error: TransportError,
): string {
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
