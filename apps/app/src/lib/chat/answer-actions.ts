import { createContext } from "react"

import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

export type AnswerActions = {
	insert: (text: string) => void
	openImage: (images: LibraryLightboxImage[], index: number) => void
}

export const AnswerActionsContext = createContext<AnswerActions | null>(null)

export const draftWithText = (draft: string, text: string) =>
	draft.trim() === "" ? text : `${draft.trimEnd()}\n${text}`
