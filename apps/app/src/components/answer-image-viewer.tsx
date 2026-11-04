import { useContext, useState } from "react"

import {
	LibraryLightbox,
	type LibraryLightboxImage,
} from "@workspace/ui/components/library-lightbox"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ShownImageActions, ThreadImage } from "@/lib/chat/answer-actions"
import { failureReporterIn } from "@/lib/failure-report"
import { shownImageSourceOf } from "@/lib/library/library-image-source"
import { useLibraryImageCopy } from "@/lib/library/use-library-actions"
import {
	type LibraryImageSave,
	useLibraryImageSave,
} from "@/lib/library/use-library-imports"
import { openInBrowser } from "@/lib/links/use-external-links"
import { isJoinedRowId } from "@/lib/spaces/joined-spaces-controller"
import { WorkspaceContext } from "@/lib/workspace/workspace-context"

type ViewedImages = {
	images: ThreadImage[]
	index: number
}

type LibraryOnScreen = {
	spaceId: string
	isJoined: boolean
}

const reportFailure = failureReporterIn("answer-image-viewer")

const copyAddress = ({ src }: LibraryLightboxImage) =>
	navigator.clipboard.writeText(src).catch((error: unknown) => {
		reportFailure({ title: i18n.t("chat:answerBlock.image.copyFailed") })
		throw error
	})

const openOriginal = ({ src }: LibraryLightboxImage) => {
	void openInBrowser(src).catch(() =>
		reportFailure({ title: i18n.t("chat:answerBlock.image.openFailed") }),
	)
}

export const useAnswerImageViewer = () => {
	const [viewed, setViewed] = useState<ViewedImages | null>(null)

	return {
		viewed,
		open: (images: ThreadImage[], index: number) =>
			setViewed({ images, index }),
		close: () => setViewed(null),
		step: (offset: number) =>
			setViewed((current) =>
				current ? { ...current, index: current.index + offset } : current,
			),
	}
}

const useLibraryOnScreen = (): LibraryOnScreen | null => {
	const workspace = useContext(WorkspaceContext)
	const rowId = workspace?.rosterView.rosteredSpaceId
	const spaceId = workspace?.rosteredHostSpaceId
	return rowId && spaceId ? { spaceId, isJoined: isJoinedRowId(rowId) } : null
}

const imageSaveOf = (
	library: LibraryOnScreen,
	image: ThreadImage,
): LibraryImageSave =>
	image.path && !library.isJoined
		? { spaceId: library.spaceId, file: { name: image.name, path: image.path } }
		: { ...library, image: shownImageSourceOf(image) }

export const useShownImageActions = (): ShownImageActions => {
	const library = useLibraryOnScreen()
	const save = useLibraryImageSave()
	const copy = useLibraryImageCopy()
	return {
		onSaveToLibrary:
			library === null
				? undefined
				: (image) => save(imageSaveOf(library, image)),
		onCopyImage: (image) => copy(shownImageSourceOf(image)),
	}
}

const barActionsOf = (
	image: ThreadImage | null,
	{ onCopyImage }: ShownImageActions,
) =>
	image?.path === undefined
		? { onCopy: copyAddress, onDownload: openOriginal }
		: { onCopy: onCopyImage }

type AnswerImageViewerProps = {
	viewed: ViewedImages | null
	imageActions: ShownImageActions
	onClose: () => void
	onStep: (offset: number) => void
}

export const AnswerImageViewer = ({
	viewed,
	imageActions,
	onClose,
	onStep,
}: AnswerImageViewerProps) => {
	const image = viewed?.images[viewed.index] ?? null

	return (
		<LibraryLightbox
			{...imageActions}
			{...barActionsOf(image, imageActions)}
			count={viewed?.images.length ?? 0}
			image={image}
			onClose={onClose}
			onNext={() => onStep(1)}
			onPrevious={() => onStep(-1)}
			position={(viewed?.index ?? 0) + 1}
		/>
	)
}
