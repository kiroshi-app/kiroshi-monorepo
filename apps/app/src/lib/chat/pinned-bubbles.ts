import { type TranscriptRow, toTranscriptRows } from "./screen-model"

import type { MessagePin } from "../conversations/store-contract"

export type PinnedBubble = {
	id: string
	bubble: TranscriptRow
	blockIndexes: number[]
}

const shownAs = (pins: MessagePin[]): PinnedBubble[] => {
	const [bubble] = toTranscriptRows([pins[0].message])
	return bubble
		? [
				{
					id: bubble.messageId,
					bubble,
					blockIndexes: pins.map((pin) => pin.blockIndex),
				},
			]
		: []
}

export const pinnedBubblesOf = (pins: MessagePin[]): PinnedBubble[] =>
	[...Map.groupBy(pins, (pin) => pin.message.id).values()].flatMap(shownAs)
