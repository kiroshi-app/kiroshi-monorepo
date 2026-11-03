import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"

import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { type DroppedFile, toImportingItem } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { importLibraryFile } from "./library-reads"

import { describeFailure } from "../failure-report"

const MIB = 1024 * 1024

const MAX_RELAYED_IMPORT_BYTES = 8 * MIB

const MAX_HOSTED_IMPORT_BYTES = 20 * MIB

const ENCODED_CHUNK_BYTES = 32 * 1024

class LibraryImportFailure extends Error {
	readonly fileName: string

	constructor(fileName: string, cause: unknown) {
		super(describeFailure(cause), { cause })
		this.fileName = fileName
	}
}

const failureNoticeOf = (error: unknown) => {
	const isImportFailure = error instanceof LibraryImportFailure
	return {
		title: i18n.t("common:library.failure.import.title", {
			name: isImportFailure ? error.fileName : "",
		}),
		description: isImportFailure ? error.message : undefined,
	}
}

const base64InChunksOf = (bytes: Uint8Array) => {
	const chunks: string[] = []
	for (let start = 0; start < bytes.length; start += ENCODED_CHUNK_BYTES) {
		const chunk = bytes.subarray(start, start + ENCODED_CHUNK_BYTES)
		chunks.push(String.fromCharCode(...chunk))
	}
	return btoa(chunks.join(""))
}

const contentOf = async (file: File) =>
	base64InChunksOf(new Uint8Array(await file.arrayBuffer()))

const importLimitOf = (isJoined: boolean) =>
	isJoined ? MAX_RELAYED_IMPORT_BYTES : MAX_HOSTED_IMPORT_BYTES

const tooLargeOf = (file: File, limit: number) => ({
	kind: "tooLarge",
	name: file.name,
	bytes: file.size,
	limit,
})

const importFile = async (spaceId: string, isJoined: boolean, file: File) => {
	const limit = importLimitOf(isJoined)
	if (file.size > limit) {
		throw new LibraryImportFailure(file.name, tooLargeOf(file, limit))
	}
	try {
		return await importLibraryFile(spaceId, file.name, await contentOf(file))
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
			failureNotice: failureNoticeOf,
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
