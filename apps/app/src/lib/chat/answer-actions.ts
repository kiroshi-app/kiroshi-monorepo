import { createContext } from "react"

import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

export type ThreadImage = LibraryLightboxImage & { path?: string }

export type ShownImageActions = {
	onSaveToLibrary?: (image: ThreadImage) => void
	onCopyImage: (image: ThreadImage) => void
	isSavingImage: (src: string) => boolean
}

export type AnswerActions = {
	insert: (text: string) => void
	openImage: (images: ThreadImage[], index: number) => void
	imageActions: ShownImageActions
}

export const AnswerActionsContext = createContext<AnswerActions | null>(null)

export const draftWithText = (draft: string, text: string) =>
	draft.trim() === "" ? text : `${draft.trimEnd()}\n${text}`
