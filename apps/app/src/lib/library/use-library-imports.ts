import { useMutation, useQueryClient } from "@tanstack/react-query"
import { open } from "@tauri-apps/plugin-dialog"
import { useCallback, useState } from "react"

import type { LibraryGalleryImage } from "@workspace/ui/components/library-block-gallery"
import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	baseNameOf,
	type LibraryImageSource,
	type LibraryImageUnreadable,
} from "./library-image-source"
import { type DroppedFile, toImportingItem } from "./library-items"
import { libraryQueryKeys } from "./library-query-keys"
import { importLibraryFile } from "./library-reads"

import { commands, type LibraryError, type LibraryItem } from "../bindings"
import { isHostRefused } from "../host/host-refused"

const MIB = 1024 * 1024

const MAX_RELAYED_IMPORT_BYTES = 8 * MIB

const MAX_HOSTED_IMPORT_BYTES = 20 * MIB

const ENCODED_CHUNK_BYTES = 32 * 1024

const WORDED_IMPORT_REASONS = [
	"tooLarge",
	"invalidName",
	"unsupported",
	"undecodable",
	"notUtf8",
	"missing",
	"unwritable",
	"unreadable",
	"unknownSpace",
	"unavailable",
	"storage",
	"imageUnreadable",
] as const satisfies readonly (
	| LibraryError["kind"]
	| LibraryImageUnreadable["kind"]
)[]

type WordedImportReason = (typeof WORDED_IMPORT_REASONS)[number]

const isWordedImportReason = (kind: unknown): kind is WordedImportReason =>
	WORDED_IMPORT_REASONS.some((reason) => reason === kind)

const refusalOf = (cause: unknown) =>
	isHostRefused(cause) ? cause.cause : cause

const importReasonOf = (cause: unknown) => {
	const refusal = refusalOf(cause)
	const kind =
		typeof refusal === "object" && refusal !== null
			? (refusal as { kind?: unknown }).kind
			: undefined
	if (isWordedImportReason(kind)) {
		return kind
	}
	return typeof kind === "string" ? "refused" : "generic"
}

class LibraryImportFailure extends Error {
	readonly fileName: string

	constructor(fileName: string, cause: unknown) {
		super(i18n.t(`common:library.failure.import.${importReasonOf(cause)}`), {
			cause,
		})
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

const tooLargeOf = (name: string, bytes: number, limit: number) => ({
	kind: "tooLarge",
	name,
	bytes,
	limit,
})

const importFile = async (spaceId: string, isJoined: boolean, file: File) => {
	const limit = importLimitOf(isJoined)
	if (file.size > limit) {
		throw new LibraryImportFailure(
			file.name,
			tooLargeOf(file.name, file.size, limit),
		)
	}
	try {
		return await importLibraryFile(spaceId, file.name, await contentOf(file))
	} catch (reason) {
		throw new LibraryImportFailure(file.name, reason)
	}
}

type ContentSave = {
	spaceId: string
	isJoined: boolean
	image: LibraryImageSource
}

type LocalFileSave = {
	spaceId: string
	file: { name: string; path: string }
}

export type LibraryImageSave = ContentSave | LocalFileSave

const decodedBytesOf = (content: string) =>
	Math.floor((content.replace(/=+$/, "").length * 3) / 4)

const withinImportLimit = (
	name: string,
	content: string,
	isJoined: boolean,
) => {
	const bytes = decodedBytesOf(content)
	const limit = importLimitOf(isJoined)
	if (bytes > limit) {
		throw tooLargeOf(name, bytes, limit)
	}
}

const importContent = async ({ spaceId, isJoined, image }: ContentSave) => {
	try {
		const { name, content } = await image.read()
		withinImportLimit(name, content, isJoined)
		return await importLibraryFile(spaceId, name, content)
	} catch (reason) {
		throw new LibraryImportFailure(image.name, reason)
	}
}

type LocalFile = LocalFileSave["file"]

const importLocalFile = async ({ spaceId, file }: LocalFileSave) => {
	const result = await commands.libraryImportPaths(spaceId, [file.path])
	const landed = result.status === "ok" ? result.data[0] : result
	if (landed?.status === "imported") {
		return landed.item
	}
	throw new LibraryImportFailure(file.name, landed?.error)
}

const importImage = (save: LibraryImageSave) =>
	"file" in save ? importLocalFile(save) : importContent(save)

export const useLibraryImageSave = () => {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: importImage,
		onSettled: (_item, _error, { spaceId }) =>
			queryClient.invalidateQueries({
				queryKey: libraryQueryKeys.itemsOf(spaceId),
			}),
		meta: {
			failureNotice: failureNoticeOf,
			raisedIn: "use-library-imports",
		},
	}).mutate
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

const GALLERY_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"]

const PATH_SEPARATOR = /[/\\]/

const pickImagePaths = async () =>
	(await open({
		multiple: true,
		directory: false,
		filters: [
			{
				name: i18n.t("common:library.filters.images"),
				extensions: GALLERY_IMAGE_EXTENSIONS,
			},
		],
	})) ?? []

const localFileAt = (path: string): LocalFile => ({
	name: path.split(PATH_SEPARATOR).pop() ?? path,
	path,
})

const pickedImageOf = ({ name, path }: LocalFile): LibraryImageSource => ({
	name,
	read: async () => {
		const result = await commands.libraryReadPickedImage(path)
		if (result.status === "error") {
			throw result.error
		}
		return result.data
	},
})

const importPicked = (spaceId: string, isJoined: boolean, file: LocalFile) =>
	isJoined
		? importContent({ spaceId, isJoined, image: pickedImageOf(file) })
		: importLocalFile({ spaceId, file })

const galleryImageOf = (
	{ name }: LocalFile,
	item: LibraryItem,
): LibraryGalleryImage => ({ src: item.name, alt: baseNameOf(name) })

export const useLibraryGalleryImports = (
	spaceId: string,
	isJoined: boolean,
) => {
	const queryClient = useQueryClient()
	const { mutateAsync } = useMutation({
		mutationFn: (file: LocalFile) => importPicked(spaceId, isJoined, file),
		meta: {
			failureNotice: failureNoticeOf,
			raisedIn: "use-library-imports",
		},
	})

	const addPicked = async () => {
		const files = (await pickImagePaths()).map(localFileAt)
		if (files.length === 0) {
			return []
		}
		const settled = await Promise.allSettled(
			files.map((file) => mutateAsync(file)),
		)
		await queryClient.invalidateQueries({
			queryKey: libraryQueryKeys.itemsOf(spaceId),
		})
		return files.flatMap((file, index) => {
			const landed = settled[index]
			return landed?.status === "fulfilled"
				? [galleryImageOf(file, landed.value)]
				: []
		})
	}
	return addPicked
}
