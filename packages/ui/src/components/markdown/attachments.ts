import { createContext, useContext } from "react"
import { defaultUrlTransform } from "react-markdown"

import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"

export type OpenAttachment = (path: string) => void

export type MarkdownAttachments = {
	resolveAttachment?: ResolveImage
	onOpenAttachment?: OpenAttachment
}

const MarkdownAttachmentsContext = createContext<MarkdownAttachments>({})

const useMarkdownAttachments = () => useContext(MarkdownAttachmentsContext)

const WINDOWS_DRIVE_PATH = /^[a-z]:[\\/]/i

const pathAsWritten = (address: string) => {
	try {
		return decodeURIComponent(address)
	} catch {
		return address
	}
}

const keepDrivePaths = (url: string) =>
	WINDOWS_DRIVE_PATH.test(pathAsWritten(url)) ? url : defaultUrlTransform(url)

const attachmentPathOf = (address: string | undefined) => {
	if (!address) return null
	const path = pathAsWritten(address)
	if (WINDOWS_DRIVE_PATH.test(path)) return path
	if (
		address.startsWith("#") ||
		address.startsWith("//") ||
		URL.canParse(address)
	)
		return null
	return path
}

const STORE_DIR = "attachments"

const MINTED_NAME =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,16})?$/

const isStoredAttachmentPath = (address: string | undefined) => {
	const path = attachmentPathOf(address)
	if (path === null) return false
	const segments = path.split(/[\\/]/)
	return (
		segments.length > 3 &&
		segments.at(-3) === STORE_DIR &&
		(segments.at(-2) ?? "").length > 0 &&
		MINTED_NAME.test(segments.at(-1) ?? "")
	)
}

export {
	attachmentPathOf,
	isStoredAttachmentPath,
	keepDrivePaths,
	MarkdownAttachmentsContext,
	useMarkdownAttachments,
}
