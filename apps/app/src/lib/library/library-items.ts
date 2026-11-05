import type { LibraryItem as ShownLibraryItem } from "@workspace/ui/components/library-grid"
import { i18n } from "@workspace/ui/lib/i18n"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import { BLANK_BOARD_SNAPSHOT, boardSnapshotOf } from "./library-boards"

import type { LibraryBoardSummary, LibraryItem } from "../bindings"

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

const DETAIL_SEPARATOR = " · "

type ItemContent = {
	excerpt: string
	src: string
	summary: LibraryBoardSummary | undefined
}

const extensionAt = (name: string) => name.lastIndexOf(".")

const formatOf = (name: string) =>
	name.slice(extensionAt(name) + 1).toUpperCase()

const formatBytes = (bytes: number) => {
	const unit = Math.min(
		Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
		SIZE_UNITS.length - 1,
	)
	const value = bytes / 1024 ** unit
	const rounded = value >= 10 ? Math.round(value) : Number(value.toFixed(1))
	return `${rounded} ${SIZE_UNITS[unit]}`
}

const isExtensionShown = (kind: LibraryItem["kind"]) => {
	switch (kind) {
		case "image":
			return true
		case "document":
		case "board":
			return false
	}
}

export const titleOf = ({ kind, name }: Pick<LibraryItem, "kind" | "name">) =>
	isExtensionShown(kind) || extensionAt(name) <= 0
		? name
		: name.slice(0, extensionAt(name))

export const shownTitleOf = (title: string) =>
	title.trim() === "" ? i18n.t("common:library.editor.untitled") : title

export const documentNamedAs = (name: string, title: string) =>
	`${title}${name.slice(titleOf({ kind: "document", name }).length)}`

export const detailOf = (item: LibraryItem, now: number) =>
	[
		formatOf(item.name),
		formatBytes(item.bytes),
		toRelativeTime(item.modifiedAt, now),
	].join(DETAIL_SEPARATOR)

const boardDetailOf = (
	item: LibraryItem,
	summary: LibraryBoardSummary | undefined,
	now: number,
) =>
	summary
		? i18n.t("common:board.card.atRest", {
				count: summary.nodeCount,
				edited: toRelativeTime(item.modifiedAt, now),
			})
		: detailOf(item, now)

export const toShownItem = (
	item: LibraryItem,
	{ excerpt, src, summary }: ItemContent,
	now: number,
): ShownLibraryItem => {
	const shared = {
		id: item.name,
		name: titleOf(item),
		detail: detailOf(item, now),
	}
	switch (item.kind) {
		case "image":
			return { ...shared, kind: "image", src }
		case "document":
			return { ...shared, kind: "document", excerpt }
		case "board":
			return {
				...shared,
				kind: "board",
				detail: boardDetailOf(item, summary, now),
				snapshot: summary ? boardSnapshotOf(summary) : BLANK_BOARD_SNAPSHOT,
			}
	}
}

export const matchesQuery = (item: LibraryItem, query: string) =>
	item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

export type DroppedFile = { id: string; file: File }

export const toImportingItem = ({
	id,
	file,
}: DroppedFile): ShownLibraryItem => {
	const importing = { id, detail: "", importProgress: 0 }
	return file.type.startsWith("image/")
		? { ...importing, kind: "image", name: file.name, src: "" }
		: {
				...importing,
				kind: "document",
				name: titleOf({ kind: "document", name: file.name }),
				excerpt: "",
			}
}
