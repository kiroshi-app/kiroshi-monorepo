import type { LibraryItem as ShownLibraryItem } from "@workspace/ui/components/library-grid"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import type { LibraryItem } from "../bindings"

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

const DETAIL_SEPARATOR = " · "

type ItemContent = { excerpt: string; src: string }

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

export const titleOf = ({ kind, name }: Pick<LibraryItem, "kind" | "name">) =>
	kind === "document" && extensionAt(name) > 0
		? name.slice(0, extensionAt(name))
		: name

const detailOf = (item: LibraryItem, now: number) =>
	[
		formatOf(item.name),
		formatBytes(item.bytes),
		toRelativeTime(item.modifiedAt, now),
	].join(DETAIL_SEPARATOR)

export const toShownItem = (
	item: LibraryItem,
	{ excerpt, src }: ItemContent,
	now: number,
): ShownLibraryItem => {
	const shared = {
		id: item.name,
		name: titleOf(item),
		detail: detailOf(item, now),
	}
	return item.kind === "image"
		? { ...shared, kind: "image", src }
		: { ...shared, kind: "document", excerpt }
}

export const matchesQuery = (item: LibraryItem, query: string) =>
	item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
