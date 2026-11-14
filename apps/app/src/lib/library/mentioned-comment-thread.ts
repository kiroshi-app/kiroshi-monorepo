import { createStore } from "../store"

export type MentionedCommentThread = {
	spaceId: string
	itemName: string
	threadId: string
}

type CommentedItem = Pick<MentionedCommentThread, "spaceId" | "itemName">

const awaited = createStore<MentionedCommentThread | null>(null)

const isOn = (
	item: CommentedItem,
	asked: MentionedCommentThread | null,
): asked is MentionedCommentThread =>
	asked?.spaceId === item.spaceId && asked.itemName === item.itemName

export const askForMentionedThread = (asked: MentionedCommentThread) =>
	awaited.setState(asked)

export const openMentionedThreadsOn = (
	item: CommentedItem,
	open: (threadId: string) => void,
) => {
	const openIfAsked = () => {
		const asked = awaited.getState()
		if (isOn(item, asked)) {
			awaited.setState(null)
			open(asked.threadId)
		}
	}
	openIfAsked()
	return awaited.subscribe(openIfAsked)
}
