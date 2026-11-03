type SharedCaret = string | null

type CaretSharerOptions = {
	caretOf: (offset: number) => string
	share: (caret: SharedCaret) => void
}

export const createCaretSharer = ({ caretOf, share }: CaretSharerOptions) => {
	let isOpen = false
	let shared: SharedCaret | undefined

	const send = (caret: SharedCaret) => {
		if (caret === null && shared === null) {
			return
		}
		shared = caret
		share(caret)
	}

	return {
		open: () => {
			isOpen = true
		},
		share: (offset: number | null) => {
			if (isOpen) {
				send(offset === null ? null : caretOf(offset))
			}
		},
		close: () => {
			if (isOpen) {
				send(null)
				isOpen = false
			}
		},
	}
}
