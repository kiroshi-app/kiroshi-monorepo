import { useEffect, useRef, useSyncExternalStore } from "react"

import {
	type ChatController,
	type ChatControllerOptions,
	createChatController,
} from "./chat-controller"
import type { ChatState } from "./chat-state"
import type { ChatDriver } from "./driver"
import { type SidebarActivity, sidebarActivityFor } from "./screen-model"

import { useController } from "../use-controller"
import type { BotPreviews } from "../bots/roster-controller"
import { type RosterLine, runsIn, type SoloThreads } from "../bots/roster-line"
import type { TranscriptStore } from "../conversations/store-port"

export type Chat = {
	state: ChatState
	controller: ChatController
}

export function useChat(
	driver: ChatDriver,
	store: TranscriptStore,
	options?: ChatControllerOptions,
): Chat {
	const { state, controller } = useController(() =>
		createChatController(driver, store, options),
	)

	useEffect(() => controller.attach(), [controller])

	return { state, controller }
}

type LineValue<Value> = RosterLine & { value: Value }

const bySpaceId = <Value>(
	shown: LineValue<Value>[],
): Record<string, Record<string, Value>> => {
	const held: Record<string, Record<string, Value>> = {}
	for (const { spaceId, botId, value } of shown) {
		held[spaceId] = { ...held[spaceId], [botId]: value }
	}
	return held
}

type BotActivity = Record<string, SidebarActivity>

export type ActivityBySpaceId = Record<string, BotActivity>

const IDLE: SidebarActivity = { isWorking: false }

const NO_ACTIVITY: BotActivity = {}

export const activityIn = (
	working: ActivityBySpaceId,
	spaceId: string | null,
): BotActivity => (spaceId ? (working[spaceId] ?? NO_ACTIVITY) : NO_ACTIVITY)

export const activityOf = (
	working: ActivityBySpaceId,
	botId: string | null,
): SidebarActivity =>
	(botId === null
		? undefined
		: Object.values(working)
				.map((held) => held[botId])
				.find((activity) => activity?.isWorking)) ?? IDLE

export const busyBotCountIn = (working: ActivityBySpaceId): number =>
	Object.values(working)
		.flatMap((held) => Object.values(held))
		.filter((activity) => activity.isWorking).length

const activitySignatureOf = (shown: LineValue<SidebarActivity>[]): string =>
	shown
		.map(
			({ spaceId, botId, value }) =>
				`${spaceId}/${botId}:${value.isWorking}:${value.kind ?? ""}`,
		)
		.join("|")

type ReadableChat = Pick<ChatController, "stateFor" | "subscribe">

export type LineActivityMount = {
	controller: ReadableChat
	lines: RosterLine[]
	soloThreads: SoloThreads
}

export function useBotActivity({
	controller,
	lines,
	soloThreads,
}: LineActivityMount): ActivityBySpaceId {
	const held = useRef<{
		signature: string
		working: ActivityBySpaceId
	} | null>(null)

	return useSyncExternalStore(controller.subscribe, () => {
		const shown = lines.map(({ spaceId, botId }) => {
			const state = controller.stateFor(botId)
			return {
				spaceId,
				botId,
				value: runsIn(soloThreads, state.conversationId, spaceId)
					? sidebarActivityFor(state)
					: IDLE,
			}
		})
		const signature = activitySignatureOf(shown)
		if (held.current?.signature !== signature) {
			held.current = { signature, working: bySpaceId(shown) }
		}
		return held.current.working
	})
}

export type PreviewsBySpaceId = Record<string, BotPreviews>

const NO_PREVIEWS: BotPreviews = {}

export const previewsIn = (
	previews: PreviewsBySpaceId,
	spaceId: string | null,
): BotPreviews => (spaceId ? (previews[spaceId] ?? NO_PREVIEWS) : NO_PREVIEWS)
