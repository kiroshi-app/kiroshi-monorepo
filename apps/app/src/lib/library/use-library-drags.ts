import { type RefObject, useEffect, useState } from "react"

import { watchConversationDrags } from "../chat/conversation-drags"

type DropFiles = (files: File[]) => void

type LibraryDrag = { isOver: boolean; fileCount: number }

const NOT_OVER: LibraryDrag = { isOver: false, fileCount: 0 }

export const useLibraryDrags = (
	panel: RefObject<HTMLElement | null>,
	onDrop: DropFiles,
) => {
	const [drag, setDrag] = useState(NOT_OVER)

	useEffect(
		() =>
			watchConversationDrags({
				conversation: panel,
				onHover: (isOver, fileCount) => setDrag({ isOver, fileCount }),
				onDrop,
			}),
		[panel, onDrop],
	)

	return drag
}
