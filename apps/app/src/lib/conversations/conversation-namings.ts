import type { ConversationNaming as NamingState } from "@workspace/ui/components/conversation-naming"

import { createStore } from "../store"

export type NamingStates = Readonly<Record<string, NamingState>>

export type NamingProgress = {
	begin: (conversationId: string) => void
	arrive: (conversationId: string) => void
	fail: (conversationId: string) => void
}

export type ConversationNamings = NamingProgress & {
	getState: () => NamingStates
	subscribe: (listener: () => void) => () => void
}

const NO_NAMINGS: NamingStates = {}

export const createConversationNamings = (): ConversationNamings => {
	const store = createStore(NO_NAMINGS)

	const mark = (conversationId: string, naming: NamingState) =>
		store.setState({ ...store.getState(), [conversationId]: naming })

	return {
		getState: store.getState,
		subscribe: store.subscribe,
		begin: (conversationId) => mark(conversationId, "pending"),
		arrive: (conversationId) => mark(conversationId, "arrived"),
		fail: (conversationId) => mark(conversationId, "failed"),
	}
}
