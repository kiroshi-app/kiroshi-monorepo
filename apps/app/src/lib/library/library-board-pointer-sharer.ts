import type { LibraryBoardSeat } from "./library-document-writes"

import type { LibraryBoardPoint } from "../bindings"

type SharedSeat = LibraryBoardSeat | null

type BoardPointerSharerOptions = {
	share: (seat: SharedSeat) => void
}

const BOARD_POINTER_SHARE_INTERVAL_MS = 50

const isSameSeat = (seat: SharedSeat, other: SharedSeat) =>
	seat === null || other === null
		? seat === other
		: seat.nodeId === other.nodeId &&
			seat.point.x === other.point.x &&
			seat.point.y === other.point.y

export const createBoardPointerSharer = ({
	share,
}: BoardPointerSharerOptions) => {
	let isOpen = false
	let lastPoint: LibraryBoardPoint | null = null
	let isPointerIn = false
	let selectedId: string | null = null
	let shared: SharedSeat = null
	let sharedAt = Number.NEGATIVE_INFINITY
	let pending: ReturnType<typeof setTimeout> | null = null

	const currentSeat = (): SharedSeat =>
		lastPoint && (isPointerIn || selectedId !== null)
			? { point: lastPoint, nodeId: selectedId }
			: null

	const send = (seat: SharedSeat) => {
		if (isSameSeat(seat, shared)) {
			return
		}
		shared = seat
		sharedAt = Date.now()
		share(seat)
	}

	const cancelPending = () => {
		if (pending !== null) {
			clearTimeout(pending)
			pending = null
		}
	}

	const sendThrottled = () => {
		if (pending !== null) {
			return
		}
		const wait = sharedAt + BOARD_POINTER_SHARE_INTERVAL_MS - Date.now()
		if (wait <= 0) {
			send(currentSeat())
			return
		}
		pending = setTimeout(() => {
			pending = null
			send(currentSeat())
		}, wait)
	}

	return {
		open: () => {
			isOpen = true
		},
		movePointer: (point: LibraryBoardPoint | null) => {
			if (!isOpen) {
				return
			}
			isPointerIn = point !== null
			lastPoint = point ?? lastPoint
			sendThrottled()
		},
		changeSelection: (ids: readonly string[]) => {
			if (!isOpen) {
				return
			}
			selectedId = ids[0] ?? null
			cancelPending()
			send(currentSeat())
		},
		close: () => {
			if (!isOpen) {
				return
			}
			cancelPending()
			send(null)
			isOpen = false
		},
	}
}
