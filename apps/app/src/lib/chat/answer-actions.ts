import { createContext } from "react"

import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

export type QuotedSelection = {
	agentName: string
	text: string
}

export type AnswerActions = {
	insert: (text: string) => void
	quote: (selection: QuotedSelection) => void
	openImage: (images: LibraryLightboxImage[], index: number) => void
}

export const AnswerActionsContext = createContext<AnswerActions | null>(null)

export const quotedMessage = (quote: string, message: string) =>
	`${quote
		.split("\n")
		.map((line) => `> ${line}`)
		.join("\n")}\n\n${message}`

export const draftWithText = (draft: string, text: string) =>
	draft.trim() === "" ? text : `${draft.trimEnd()}\n${text}`
