import { createContext, useContext } from "react"

import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

type MarkdownAnswerActions = {
	agentName: string
	onPickOption: (option: string) => void
	onUseValues: (summary: string) => void
	onOpenImage: (images: LibraryLightboxImage[], index: number) => void
	onOpenWebPage?: (url: string) => void
}

const MarkdownAnswerContext = createContext<MarkdownAnswerActions | null>(null)

const useMarkdownAnswerActions = () => useContext(MarkdownAnswerContext)

export {
	type MarkdownAnswerActions,
	MarkdownAnswerContext,
	useMarkdownAnswerActions,
}
