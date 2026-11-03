import type { ReplyTarget } from "./screen-model"

export type DraftsController = {
	read: (threadId: string) => string
	remember: (threadId: string, draft: string) => void
	readReplies: (threadId: string) => ReplyTarget[]
	rememberReplies: (threadId: string, targets: ReplyTarget[]) => void
	forget: (threadId: string) => void
}

const NO_REPLIES: ReplyTarget[] = []

export const createDraftsController = (): DraftsController => {
	const drafts = new Map<string, string>()
	const replies = new Map<string, ReplyTarget[]>()

	return {
		read: (threadId) => drafts.get(threadId) ?? "",

		remember: (threadId, draft) => {
			drafts.set(threadId, draft)
		},

		readReplies: (threadId) => replies.get(threadId) ?? NO_REPLIES,

		rememberReplies: (threadId, targets) => {
			replies.set(threadId, targets)
		},

		forget: (threadId) => {
			drafts.delete(threadId)
			replies.delete(threadId)
		},
	}
}
