import {
	type ConversationController,
	type ConversationControllerOptions,
	createConversationController,
} from "./conversation-controller"
import type { TranscriptStore } from "./store-port"

import type { ChatDriver } from "../chat/driver"

export type ConversationRuntimes = {
	runtimeFor: (conversationId: string) => ConversationController
	heldFor: (conversationId: string) => ConversationController | null
	subscribe: (listener: () => void) => () => void
	release: (conversationId: string) => Promise<void>
	shutdown: () => Promise<void>
}

type HeldRuntime = {
	controller: ConversationController
	stop: () => void
}

export type ConversationRuntimesOptions = Pick<
	ConversationControllerOptions,
	| "onNamed"
	| "readReportedRuns"
	| "onCompanionArrived"
	| "onForeignSpeakerSilent"
	| "senderAccountId"
>

export const createConversationRuntimes = (
	driver: ChatDriver,
	store: TranscriptStore,
	options: ConversationRuntimesOptions = {},
): ConversationRuntimes => {
	const runtimes = new Map<string, HeldRuntime>()
	const listeners = new Set<() => void>()

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	const runtimeFor = (conversationId: string) => {
		const held = runtimes.get(conversationId)
		if (held) {
			return held.controller
		}
		const opened = createConversationController(driver, store, options)
		opened.attach()
		runtimes.set(conversationId, {
			controller: opened,
			stop: opened.subscribe(publish),
		})
		return opened
	}

	const heldFor = (conversationId: string) =>
		runtimes.get(conversationId)?.controller ?? null

	const subscribe = (listener: () => void) => {
		listeners.add(listener)
		return () => {
			listeners.delete(listener)
		}
	}

	const release = async (conversationId: string) => {
		const held = runtimes.get(conversationId)
		if (!held) {
			return
		}
		runtimes.delete(conversationId)
		held.stop()
		publish()
		await held.controller.shutdown().catch(() => undefined)
	}

	const shutdown = async () => {
		const open = [...runtimes.values()]
		runtimes.clear()
		for (const held of open) {
			held.stop()
		}
		await Promise.all(open.map((held) => held.controller.shutdown()))
	}

	return { runtimeFor, heldFor, subscribe, release, shutdown }
}
