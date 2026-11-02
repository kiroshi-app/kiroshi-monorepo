import type { LibraryItem as ShownLibraryItem } from "@workspace/ui/components/library-grid"
import { toRelativeTime } from "@workspace/ui/lib/time-format"

import type { LibraryItem } from "../bindings"
import { convertFileSrc } from "../host/tauri"

const SIZE_UNITS = ["B", "KB", "MB", "GB"]

const DETAIL_SEPARATOR = " · "

const extensionAt = (name: string) => name.lastIndexOf(".")

export const extensionOf = (name: string) =>
	name.slice(extensionAt(name) + 1).toLowerCase()

const formatOf = (name: string) => extensionOf(name).toUpperCase()

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

export const detailOf = (item: LibraryItem, now: number) =>
	[
		formatOf(item.name),
		formatBytes(item.bytes),
		toRelativeTime(item.modifiedAt, now),
	].join(DETAIL_SEPARATOR)

export const toShownItem = (
	item: LibraryItem,
	excerpt: string,
	now: number,
): ShownLibraryItem => {
	const shared = {
		id: item.name,
		name: titleOf(item),
		detail: detailOf(item, now),
	}
	return item.kind === "image"
		? { ...shared, kind: "image", src: convertFileSrc(item.path) }
		: { ...shared, kind: "document", excerpt }
}

export const matchesQuery = (item: LibraryItem, query: string) =>
	item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
