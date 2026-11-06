import { useEffect, useMemo } from "react"

import { createBoardPointerSharer } from "./library-board-pointer-sharer"
import { shareLibraryBoardSeat } from "./library-document-writes"

const logShareFailure = (reason: unknown) =>
	console.error("library: the board pointer could not be shared", reason)

export const useLibraryBoardPointerShare = (spaceId: string, name: string) => {
	const sharer = useMemo(
		() =>
			createBoardPointerSharer({
				share: (seat) => {
					shareLibraryBoardSeat(spaceId, name, seat).catch(logShareFailure)
				},
			}),
		[spaceId, name],
	)

	useEffect(() => {
		sharer.open()
		return sharer.close
	}, [sharer])

	return {
		movePointer: sharer.movePointer,
		changeSelection: sharer.changeSelection,
	}
}
