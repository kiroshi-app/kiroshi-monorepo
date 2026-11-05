import { createContext, useContext } from "react"

import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"

export type OpenAttachment = (path: string) => void

export type MarkdownAttachments = {
	resolveAttachment?: ResolveImage
	onOpenAttachment?: OpenAttachment
}

const MarkdownAttachmentsContext = createContext<MarkdownAttachments>({})

const useMarkdownAttachments = () => useContext(MarkdownAttachmentsContext)

const attachmentPathOf = (address: string | undefined) => {
	if (
		!address ||
		address.startsWith("#") ||
		address.startsWith("//") ||
		URL.canParse(address)
	)
		return null
	return decodeURIComponent(address)
}

export { attachmentPathOf, MarkdownAttachmentsContext, useMarkdownAttachments }
