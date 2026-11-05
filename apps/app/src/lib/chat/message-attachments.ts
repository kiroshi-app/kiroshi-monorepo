import type { MessageAttachment } from "@workspace/ui/components/message-attachments"

import { assetSrc } from "../host"

const STORE_DIR = "attachments"

const MINTED_NAME =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,16})?$/

const IMAGE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"ico",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"webp",
])

const NO_MESSAGE_ATTACHMENTS: MessageAttachment[] = []

export type StoredAttachmentPlace = {
	root: string
	conversationId: string
	submittedName: string
}

export type MessageContent = {
	text: string
	attachments: MessageAttachment[]
}

const segmentsOf = (path: string): string[] => path.split(/[\\/]/)

const nameOf = (path: string): string => segmentsOf(path).at(-1) ?? path

const extensionOf = (name: string): string => {
	const dot = name.lastIndexOf(".")
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : ""
}

const isStoredAttachmentPath = (line: string): boolean => {
	const segments = segmentsOf(line.trim())
	return (
		segments.length > 3 &&
		segments.at(-3) === STORE_DIR &&
		(segments.at(-2) ?? "").length > 0 &&
		MINTED_NAME.test(segments.at(-1) ?? "")
	)
}

const toAttachment = (path: string): MessageAttachment => {
	const name = nameOf(path)
	return {
		id: path,
		name,
		previewUrl: IMAGE_EXTENSIONS.has(extensionOf(name))
			? assetSrc(path)
			: undefined,
	}
}

export const storedAttachmentPath = ({
	root,
	conversationId,
	submittedName,
}: StoredAttachmentPlace): string => {
	const extension = extensionOf(submittedName)
	const minted = extension
		? `${crypto.randomUUID()}.${extension}`
		: crypto.randomUUID()
	return [root, STORE_DIR, conversationId, minted].join("/")
}

const BLOCK_HEADER =
	/^Attached to this message, sent \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z, (\d+) files?:$/

const ORDINAL_LINE = /^(\d+)\/(\d+) (.+)$/

const blockHeader = (sentAt: Date, count: number): string =>
	`Attached to this message, sent ${sentAt.toISOString()}, ${count} ${count === 1 ? "file" : "files"}:`

export const attachmentBlock = (paths: string[], sentAt: Date): string =>
	[
		blockHeader(sentAt, paths.length),
		...paths.map((path, index) => `${index + 1}/${paths.length} ${path}`),
	].join("\n")

const untouched = (text: string): MessageContent => ({
	text,
	attachments: NO_MESSAGE_ATTACHMENTS,
})

const pathOfOrdinalLine = (
	line: string,
	position: number,
	count: number,
): string | null => {
	const match = ORDINAL_LINE.exec(line)
	if (!match) {
		return null
	}
	const [, index, total, path = ""] = match
	const isInPlace = Number(index) === position && Number(total) === count
	return isInPlace && isStoredAttachmentPath(path) ? path : null
}

const blockPaths = (header: string, entries: string[]): string[] | null => {
	const count = Number(BLOCK_HEADER.exec(header)?.[1])
	if (entries.length !== count) {
		return null
	}
	const paths = entries.map((line, index) =>
		pathOfOrdinalLine(line, index + 1, count),
	)
	return paths.every((path) => path !== null) ? paths : null
}

const messageWithBlock = (
	text: string,
	lines: string[],
	headerIndex: number,
): MessageContent => {
	const paths = blockPaths(
		lines[headerIndex] ?? "",
		lines.slice(headerIndex + 1),
	)
	if (!paths) {
		return untouched(text)
	}
	return {
		text: lines.slice(0, headerIndex).join("\n").trimEnd(),
		attachments: paths.map(toAttachment),
	}
}

const messageWithBarePaths = (
	text: string,
	lines: string[],
): MessageContent => {
	let firstPath = lines.length
	while (firstPath > 0 && isStoredAttachmentPath(lines[firstPath - 1] ?? "")) {
		firstPath -= 1
	}

	if (firstPath === lines.length) {
		return untouched(text)
	}

	return {
		text: lines.slice(0, firstPath).join("\n").trimEnd(),
		attachments: lines
			.slice(firstPath)
			.map((line) => toAttachment(line.trim())),
	}
}

export const messageWithAttachments = (text: string): MessageContent => {
	const lines = text.trimEnd().split("\n")
	const headerIndex = lines.findLastIndex((line) => BLOCK_HEADER.test(line))
	return headerIndex === -1
		? messageWithBarePaths(text, text.split("\n"))
		: messageWithBlock(text, lines, headerIndex)
}

const LINK_DESTINATION = /\]\((?:<([^>]*)>|([^\s)]+))\)/g

export const citesStoredAttachment = (text: string): boolean =>
	[...text.matchAll(LINK_DESTINATION)].some(([, angled, bare]) =>
		isStoredAttachmentPath(angled ?? bare ?? ""),
	)

export const citedAttachmentOf = (path: string): MessageAttachment | null =>
	isStoredAttachmentPath(path) ? toAttachment(path) : null

export const resolveCitedImage = async (path: string): Promise<string> => {
	const previewUrl = citedAttachmentOf(path)?.previewUrl
	if (!previewUrl) {
		throw new Error(`${path} is not a stored image attachment`)
	}
	return previewUrl
}
