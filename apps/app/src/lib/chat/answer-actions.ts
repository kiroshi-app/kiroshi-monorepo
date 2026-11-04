import { createContext } from "react"

import type { ImageMenuActions } from "@workspace/ui/components/image-menu"
import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

export type ShownImageActions = Pick<
	ImageMenuActions<LibraryLightboxImage>,
	"onSaveToLibrary" | "onCopyImage"
>

export type AnswerActions = {
	insert: (text: string) => void
	openImage: (images: LibraryLightboxImage[], index: number) => void
	imageActions: ShownImageActions
}

export const AnswerActionsContext = createContext<AnswerActions | null>(null)

export const draftWithText = (draft: string, text: string) =>
	draft.trim() === "" ? text : `${draft.trimEnd()}\n${text}`
