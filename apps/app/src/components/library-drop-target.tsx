import { LibraryDropOverlay } from "@workspace/ui/components/library-import"
import { useLibraryOverlayContainer } from "@workspace/ui/components/library-panel"

import { useLibraryDrags } from "@/lib/library/use-library-drags"

type LibraryDropTargetProps = {
	onDrop: (files: File[]) => void
}

const NO_PANEL = { current: null }

export const LibraryDropTarget = ({ onDrop }: LibraryDropTargetProps) => {
	const panel = useLibraryOverlayContainer() ?? NO_PANEL
	const { isOver, fileCount } = useLibraryDrags(panel, onDrop)

	return isOver ? <LibraryDropOverlay fileCount={fileCount} /> : null
}
