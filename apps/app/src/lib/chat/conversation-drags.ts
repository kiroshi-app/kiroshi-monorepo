const FILES = "Files"

const carriesFiles = (event: DragEvent) =>
	Boolean(event.dataTransfer?.types.includes(FILES))

const fileCountOf = (event: DragEvent) =>
	Array.from(event.dataTransfer?.items ?? []).filter(
		(item) => item.kind === "file",
	).length

export type ConversationDragsPort = {
	conversation: { current: HTMLElement | null }
	onHover: (isOver: boolean, fileCount: number) => void
	onDrop: (files: File[]) => void
}

export const watchConversationDrags = ({
	conversation,
	onHover,
	onDrop,
}: ConversationDragsPort) => {
	let depth = 0
	let isOver = false

	const isInside = (target: EventTarget | null) =>
		target instanceof Node && Boolean(conversation.current?.contains(target))

	const mark = (next: boolean, fileCount = 0) => {
		if (next === isOver) {
			return
		}
		isOver = next
		onHover(next, fileCount)
	}

	const settle = () => {
		depth = 0
		mark(false)
	}

	const handlers: Record<string, (event: DragEvent) => void> = {
		dragover: (event) => {
			if (carriesFiles(event)) {
				event.preventDefault()
			}
		},
		dragenter: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			depth += 1
			mark(isInside(event.target), fileCountOf(event))
		},
		dragleave: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			depth = Math.max(depth - 1, 0)
			if (depth === 0) {
				mark(false)
			}
		},
		dragend: settle,
		drop: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			const taken = event.defaultPrevented
			event.preventDefault()
			settle()
			if (taken || !isInside(event.target)) {
				return
			}
			onDrop(Array.from(event.dataTransfer?.files ?? []))
		},
	}

	const entries = Object.entries(handlers) as [string, EventListener][]
	for (const [type, handler] of entries) {
		window.addEventListener(type, handler)
	}

	return () => {
		for (const [type, handler] of entries) {
			window.removeEventListener(type, handler)
		}
		settle()
	}
}
