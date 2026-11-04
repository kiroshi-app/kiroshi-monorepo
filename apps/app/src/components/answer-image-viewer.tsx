import { useMutationState } from "@tanstack/react-query"
import { useContext, useState } from "react"

import {
	LibraryLightbox,
	type LibraryLightboxImage,
} from "@workspace/ui/components/library-lightbox"
import { raiseTransientNotice } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { LibraryItem } from "@/lib/bindings"
import type { ShownImageActions, ThreadImage } from "@/lib/chat/answer-actions"
import { failureReporterIn } from "@/lib/failure-report"
import { shownImageSourceOf } from "@/lib/library/library-image-source"
import { libraryQueryKeys } from "@/lib/library/library-query-keys"
import { useLibraryImageCopy } from "@/lib/library/use-library-actions"
import {
	type LibraryImageSave,
	useLibraryImageSave,
} from "@/lib/library/use-library-imports"
import { openInBrowser } from "@/lib/links/use-external-links"
import { useOpenLibraryImage } from "@/lib/navigation/use-open-library-image"
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

export const useLibraryOnScreen = (): LibraryOnScreen | null => {
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

type ThreadImageSave = LibraryImageSave & { src: string }

const threadImageSaveOf = (
	library: LibraryOnScreen,
	image: ThreadImage,
): ThreadImageSave => ({ ...imageSaveOf(library, image), src: image.src })

const savedSrcOf = (save: unknown) =>
	typeof save === "object" && save !== null && "src" in save
		? save.src
		: undefined

const useSavingImageSrcs = () =>
	useMutationState({
		filters: { mutationKey: libraryQueryKeys.imageSave(), status: "pending" },
		select: ({ state }) => savedSrcOf(state.variables),
	})

const useRaiseImageSaved = () => {
	const openInLibrary = useOpenLibraryImage()
	return ({ name }: LibraryItem) =>
		void raiseTransientNotice({
			type: "success",
			title: i18n.t("common:library.saved.image"),
			action: {
				label: i18n.t("common:library.panel.openInLibrary"),
				onPress: () => openInLibrary(name),
			},
		})
}

export const useShownImageActions = (): ShownImageActions => {
	const library = useLibraryOnScreen()
	const save = useLibraryImageSave(useRaiseImageSaved())
	const copy = useLibraryImageCopy()
	const savingSrcs = useSavingImageSrcs()
	const isSavingImage = (src: string) => savingSrcs.includes(src)
	const saveOnce = (library: LibraryOnScreen, image: ThreadImage) => {
		if (isSavingImage(image.src)) {
			return
		}
		save(threadImageSaveOf(library, image))
	}
	return {
		onSaveToLibrary:
			library === null ? undefined : (image) => saveOnce(library, image),
		onCopyImage: (image) => copy(shownImageSourceOf(image)),
		isSavingImage,
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
