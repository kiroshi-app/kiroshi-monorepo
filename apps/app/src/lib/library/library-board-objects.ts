import type {
	ImageNode,
	LibraryCardNode,
	LinkCardNode,
} from "@workspace/shared/board/board"
import type { BoardLibraryItem } from "@workspace/ui/components/board/board-dock"
import type { BoardLibraryCardProps } from "@workspace/ui/components/board/board-library-card"
import type { BoardLinkCardProps } from "@workspace/ui/components/board/board-link-card"

const listedItemOf = (
	libraryItems: readonly BoardLibraryItem[],
	name: string | undefined,
) => libraryItems.find((item) => item.id === name)

const domainOf = (url: string) =>
	URL.canParse(url) ? new URL(url).hostname : url

export const imageSourceOf = (
	{ item }: ImageNode,
	libraryItems: readonly BoardLibraryItem[],
) => {
	const listed = listedItemOf(libraryItems, item)
	return listed?.kind === "image" ? listed.src : ""
}

export const linkCardOf = ({
	url,
	title,
	description,
	preview,
}: LinkCardNode): BoardLinkCardProps => ({
	title: title ?? url,
	description: description ?? "",
	preview: preview ?? "",
	domain: domainOf(url),
})

export const libraryCardOf = (
	{ item, file }: LibraryCardNode,
	libraryItems: readonly BoardLibraryItem[],
): BoardLibraryCardProps => {
	const listed = listedItemOf(libraryItems, item)
	return {
		title: listed?.title ?? item ?? file,
		excerpt: listed?.kind === "document" ? listed.excerpt : "",
	}
}
