import { useState } from "react"

import {
	LibraryLightbox,
	type LibraryLightboxImage,
} from "@workspace/ui/components/library-lightbox"
import { i18n } from "@workspace/ui/lib/i18n"

import { failureReporterIn } from "@/lib/failure-report"
import { openInBrowser } from "@/lib/links/use-external-links"

type ViewedImages = {
	images: LibraryLightboxImage[]
	index: number
}

const reportFailure = failureReporterIn("answer-image-viewer")

const copyAddress = ({ src }: LibraryLightboxImage) => {
	void navigator.clipboard
		.writeText(src)
		.catch(() =>
			reportFailure({ title: i18n.t("chat:answerBlock.image.copyFailed") }),
		)
}

const openOriginal = ({ src }: LibraryLightboxImage) => {
	void openInBrowser(src).catch(() =>
		reportFailure({ title: i18n.t("chat:answerBlock.image.openFailed") }),
	)
}

export const useAnswerImageViewer = () => {
	const [viewed, setViewed] = useState<ViewedImages | null>(null)

	return {
		viewed,
		open: (images: LibraryLightboxImage[], index: number) =>
			setViewed({ images, index }),
		close: () => setViewed(null),
		step: (offset: number) =>
			setViewed((current) =>
				current ? { ...current, index: current.index + offset } : current,
			),
	}
}

type AnswerImageViewerProps = {
	viewed: ViewedImages | null
	onClose: () => void
	onStep: (offset: number) => void
}

export const AnswerImageViewer = ({
	viewed,
	onClose,
	onStep,
}: AnswerImageViewerProps) => (
	<LibraryLightbox
		count={viewed?.images.length ?? 0}
		image={viewed?.images[viewed.index] ?? null}
		onClose={onClose}
		onCopy={copyAddress}
		onDownload={openOriginal}
		onNext={() => onStep(1)}
		onPrevious={() => onStep(-1)}
		position={(viewed?.index ?? 0) + 1}
	/>
)
