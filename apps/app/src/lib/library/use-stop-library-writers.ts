import { useMutation } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import type { CancelOutcome } from "../bindings"
import { invoke } from "../host/index"

type StoppedWriter = {
	id: string
	name: string
}

type StopRun = {
	name: string
	writer: StoppedWriter | null
}

class LibraryWritersNotStopped extends Error {
	readonly writer: StoppedWriter | null

	constructor(writer: StoppedWriter | null, cause: unknown) {
		super("library writers not stopped", { cause })
		this.writer = writer
	}
}

const outcomeOfStop = async (spaceId: string, { name, writer }: StopRun) => {
	try {
		return await invoke<CancelOutcome>("library_stop_writers", {
			spaceId,
			name,
			agentId: writer?.id ?? null,
		})
	} catch (reason) {
		throw new LibraryWritersNotStopped(writer, reason)
	}
}

const stopWriters = async (spaceId: string, run: StopRun) => {
	const outcome = await outcomeOfStop(spaceId, run)
	if (outcome.kind === "failed") {
		throw new LibraryWritersNotStopped(run.writer, outcome.failures)
	}
}

const stopFailureNoticeOf = (error: unknown) => {
	const writer = error instanceof LibraryWritersNotStopped ? error.writer : null
	return {
		title: writer
			? i18n.t("common:library.failure.document.stop", { name: writer.name })
			: i18n.t("common:library.failure.document.stopAll"),
	}
}

export const useStopLibraryWriters = (spaceId: string) => {
	const stopping = useMutation({
		mutationFn: (run: StopRun) => stopWriters(spaceId, run),
		meta: {
			failureNotice: stopFailureNoticeOf,
			raisedIn: "use-stop-library-writers",
		},
	})
	return {
		stopAll: (name: string) => stopping.mutate({ name, writer: null }),
		stop: (name: string, writer: StoppedWriter) =>
			stopping.mutate({ name, writer }),
	}
}
