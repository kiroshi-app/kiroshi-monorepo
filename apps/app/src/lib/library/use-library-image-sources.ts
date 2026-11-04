import { useQueries, useQueryClient } from "@tanstack/react-query"

import { i18n } from "@workspace/ui/lib/i18n"

import { libraryQueryKeys } from "./library-query-keys"
import { readLibraryImage } from "./library-reads"

import type { LibraryImage, LibraryItem } from "../bindings"
import { convertFileSrc } from "../host/tauri"

type SourceOf = (item: LibraryItem) => string

const NO_IMAGES: LibraryItem[] = []

const dataUrlOf = ({ mimeType, content }: LibraryImage) =>
	`data:${mimeType};base64,${content}`

const fileSourceOf: SourceOf = (item) => convertFileSrc(item.path)

const useHostImageSources = (
	spaceId: string,
	images: LibraryItem[],
): SourceOf => {
	const reads = useQueries({
		queries: images.map((image) => ({
			queryKey: libraryQueryKeys.imageOf(spaceId, image.name, image.modifiedAt),
			queryFn: () => readLibraryImage(spaceId, image.name),
			select: dataUrlOf,
			meta: {
				failureNotice: () => ({
					title: i18n.t("common:library.failure.image"),
				}),
				raisedIn: "use-library-image-sources",
			},
		})),
	})
	const sourceByName = new Map(
		images.map((image, index) => [image.name, reads[index]?.data ?? ""]),
	)
	return (item) => sourceByName.get(item.name) ?? ""
}

export const useLibraryImageSources = (
	spaceId: string,
	items: LibraryItem[],
	isJoined: boolean,
): SourceOf => {
	const images = isJoined
		? items.filter((item) => item.kind === "image")
		: NO_IMAGES
	const hostSourceOf = useHostImageSources(spaceId, images)
	return isJoined ? hostSourceOf : fileSourceOf
}

const listedImageNamed = (items: LibraryItem[] | undefined, name: string) => {
	const image = items?.find(
		(item) => item.kind === "image" && item.name === name,
	)
	if (!image) {
		throw new Error(`no Library image named ${name}`)
	}
	return image
}

export const useLibraryImageResolver = (spaceId: string, isJoined: boolean) => {
	const queryClient = useQueryClient()
	const readDataUrl = async ({ name, modifiedAt }: LibraryItem) =>
		dataUrlOf(
			await queryClient.fetchQuery({
				queryKey: libraryQueryKeys.imageOf(spaceId, name, modifiedAt),
				queryFn: () => readLibraryImage(spaceId, name),
				meta: { rendersErrorInline: true },
			}),
		)
	return async (src: string) => {
		const image = listedImageNamed(
			queryClient.getQueryData<LibraryItem[]>(
				libraryQueryKeys.itemsOf(spaceId),
			),
			src,
		)
		return isJoined ? readDataUrl(image) : fileSourceOf(image)
	}
}
