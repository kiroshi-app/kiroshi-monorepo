import { createContext, useContext } from "react"

import {
	type ImageMenuActions,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"

type MarkdownAnswerActions = {
	agentName: string
	onUseValues: (summary: string) => void
	onOpenImage: (images: LibraryLightboxImage[], index: number) => void
	onOpenWebPage?: (url: string) => void
	onToggleChecklistItem?: (
		checklist: string,
		index: number,
		isChecked: boolean,
	) => void
	onCopyChecklist?: (list: string) => void
	onDownloadTable?: (csv: string) => void
	imageMenu?: Pick<
		ImageMenuActions<LibraryLightboxImage>,
		"onSaveToLibrary" | "onCopyImage"
	>
	isSavingImage?: (src: string) => boolean
}

const MarkdownAnswerContext = createContext<MarkdownAnswerActions | null>(null)

const useMarkdownAnswerActions = () => useContext(MarkdownAnswerContext)

const answerImageMenuOf = (
	actions: MarkdownAnswerActions | null,
	images: LibraryLightboxImage[],
): ImageMenuActions<number> | undefined => {
	if (!actions?.imageMenu) return undefined

	return {
		...imageMenuActionsFor(actions.imageMenu, (index: number) => images[index]),
		onOpenInViewer: (index) => actions.onOpenImage(images, index),
	}
}

const answerImageSavingOf = (
	actions: MarkdownAnswerActions | null,
	images: LibraryLightboxImage[],
): ((index: number) => boolean) | undefined => {
	const isSavingImage = actions?.isSavingImage
	if (!isSavingImage) return undefined

	return (index) => isSavingImage(images[index].src)
}

export {
	answerImageMenuOf,
	answerImageSavingOf,
	type MarkdownAnswerActions,
	MarkdownAnswerContext,
	useMarkdownAnswerActions,
}
