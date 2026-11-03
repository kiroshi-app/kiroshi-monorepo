import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { base64Of } from "./library-document-session"
import { type DroppedFile, toImportingItem } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { importLibraryFile } from "./library-reads"

import { describeFailure } from "../failure-report"

const MAX_RELAYED_IMPORT_BYTES = 8 * 1024 * 1024

class LibraryImportFailure extends Error {
	readonly fileName: string

	constructor(fileName: string, cause: unknown) {
		super(describeFailure(cause), { cause })
		this.fileName = fileName
	}
}

const fileNameOf = (error: unknown) =>
	error instanceof LibraryImportFailure ? error.fileName : ""

const contentOf = async (file: File) =>
	base64Of(new Uint8Array(await file.arrayBuffer()))

const isOverRelayedLimit = (file: File) => file.size > MAX_RELAYED_IMPORT_BYTES

const tooLargeOf = (file: File) => ({
	kind: "tooLarge",
	name: file.name,
	bytes: file.size,
	limit: MAX_RELAYED_IMPORT_BYTES,
})

const sendFile = async (spaceId: string, file: File) =>
	importLibraryFile(spaceId, file.name, await contentOf(file))

const importFile = async (spaceId: string, isJoined: boolean, file: File) => {
	if (isJoined && isOverRelayedLimit(file)) {
		throw new LibraryImportFailure(file.name, tooLargeOf(file))
	}
	try {
		return await sendFile(spaceId, file)
	} catch (reason) {
		throw new LibraryImportFailure(file.name, reason)
	}
}

const announceAdded = (count: number) => {
	if (count > 0) {
		raiseTransientNotice({
			title: i18n.t("common:library.added.title", { count }),
		})
	}
}

const droppedOf = (file: File): DroppedFile => ({
	id: crypto.randomUUID(),
	file,
})

export const useLibraryImports = (spaceId: string, isJoined: boolean) => {
	const queryClient = useQueryClient()
	const [importing, setImporting] = useState<DroppedFile[]>([])
	const forget = useCallback((ids: string[]) => {
		setImporting((current) =>
			current.filter((dropped) => !ids.includes(dropped.id)),
		)
	}, [])
	const { mutateAsync } = useMutation({
		mutationFn: ({ file }: DroppedFile) => importFile(spaceId, isJoined, file),
		onError: (_error, { id }) => forget([id]),

		meta: {
			failureNotice: (error) => ({
				title: i18n.t("common:library.failure.import", {
					name: fileNameOf(error),
				}),
			}),
			raisedIn: "use-library-imports",
		},
	})

	const importDropped = useCallback(
		async (files: File[]) => {
			const dropped = files.map(droppedOf)
			setImporting((current) => [...dropped, ...current])
			const settled = await Promise.allSettled(
				dropped.map((file) => mutateAsync(file)),
			)
			await queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			})
			forget(dropped.map(({ id }) => id))
			announceAdded(
				settled.filter(({ status }) => status === "fulfilled").length,
			)
		},
		[forget, mutateAsync, queryClient, spaceId],
	)

	return { importingItems: importing.map(toImportingItem), importDropped }
}
