"use client"

import { useEffect } from "react"

type ClosableCard = { onClose: () => void }

type CommentEscapeLayers = {
	draft?: ClosableCard
	openThread?: ClosableCard
	leaveCommentMode?: () => void
}

const closeInnermostCommentLayer = ({
	draft,
	openThread,
	leaveCommentMode,
}: CommentEscapeLayers) => {
	const close = draft?.onClose ?? openThread?.onClose ?? leaveCommentMode
	close?.()
	return close !== undefined
}

const useMentionMenuEscape = (isOpen: boolean, onDismiss: () => void) => {
	useEffect(() => {
		if (!isOpen) return

		const closeMenuOnly = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.isComposing) return
			event.preventDefault()
			event.stopPropagation()
			onDismiss()
		}

		window.addEventListener("keydown", closeMenuOnly, true)
		return () => window.removeEventListener("keydown", closeMenuOnly, true)
	}, [isOpen, onDismiss])
}

export {
	type CommentEscapeLayers,
	closeInnermostCommentLayer,
	useMentionMenuEscape,
}
