import { useMutation } from "@tanstack/react-query"

import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
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

const stopWriters = async (spaceId: string, { name, writer }: StopRun) => {
	const outcome = await invoke<CancelOutcome>("library_stop_writers", {
		spaceId,
		name,
		agentId: writer?.id ?? null,
	})
	if (outcome.kind === "failed") {
		throw outcome.failures
	}
}

const stopOrFail = async (spaceId: string, run: StopRun) => {
	try {
		await stopWriters(spaceId, run)
	} catch (reason) {
		throw new LibraryWritersNotStopped(run.writer, reason)
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

const boardStopFailureNoticeOf = () => ({
	title: i18n.t("common:library.failure.board.stopAll"),
})

type StopFailureNotice = (error: unknown) => NoticeMessage

const useStopping = (spaceId: string, failureNotice: StopFailureNotice) =>
	useMutation({
		mutationFn: (run: StopRun) => stopOrFail(spaceId, run),
		meta: {
			failureNotice,
			raisedIn: "use-stop-library-writers",
		},
	})

export const useStopLibraryBoardDrawers = (spaceId: string) => {
	const stopping = useStopping(spaceId, boardStopFailureNoticeOf)
	return {
		stopAll: (name: string) => stopping.mutate({ name, writer: null }),
	}
}

export const useStopLibraryWriters = (spaceId: string) => {
	const stopping = useStopping(spaceId, stopFailureNoticeOf)
	return {
		stopAll: (name: string) => stopping.mutate({ name, writer: null }),
		stop: (name: string, writer: StoppedWriter) =>
			stopping.mutate({ name, writer }),
	}
}
