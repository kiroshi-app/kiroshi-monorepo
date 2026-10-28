import { i18n } from "@workspace/ui/lib/i18n"

import { raiseReportedFailure } from "../failure-report"
import type { ChatController } from "../chat/chat-controller"
import { isTurnBusy } from "../chat/chat-state"
import type { Bot, EnvOwner } from "../conversations/store-contract"

export type ReopenedScope =
	| { kind: "user" }
	| { kind: "space"; id: string }
	| { kind: "companion"; id: string }

export type CompanionRosters = Record<string, Bot[]>

type SessionReopening = {
	scope: ReopenedScope
	application: string
}

export type SessionReopenerParts = {
	chat: Pick<ChatController, "reopen" | "stateFor">
	rosters: () => CompanionRosters
}

export type SessionReopener = (reopening: SessionReopening) => Promise<void>

export const scopeOfOwner = (owner: EnvOwner): ReopenedScope =>
	owner.kind === "bot" ? { kind: "companion", id: owner.id } : owner

export const ownerOfScope = (
	scope: ReopenedScope,
	spaceId: string | null,
): EnvOwner | null => {
	if (scope.kind !== "companion") {
		return scope
	}
	return spaceId ? { kind: "bot", id: scope.id, spaceId } : null
}

const everyCompanion = (rosters: CompanionRosters) => [
	...new Map(
		Object.values(rosters)
			.flat()
			.map((companion) => [companion.id, companion] as const),
	).values(),
]

const companionsIn = (rosters: CompanionRosters, scope: ReopenedScope) => {
	if (scope.kind === "space") {
		return rosters[scope.id] ?? []
	}
	const every = everyCompanion(rosters)
	return scope.kind === "user"
		? every
		: every.filter((companion) => companion.id === scope.id)
}

export const createSessionReopener = ({
	chat,
	rosters,
}: SessionReopenerParts): SessionReopener => {
	const reopenOne = async (companion: Bot, application: string) => {
		const handle = await chat.reopen(companion.id)
		if (handle) {
			return
		}
		raiseReportedFailure(
			{
				title: i18n.t("bots:applications.reopen.refused.title", {
					agent: companion.name,
				}),
				description: i18n.t("bots:applications.reopen.refused.description", {
					name: application,
				}),
			},
			{
				raisedIn: "session-reopening",
				botId: companion.id,
				botName: companion.name,
			},
		)
	}

	const isMidTurn = (companion: Bot) =>
		isTurnBusy(chat.stateFor(companion.id).turn)

	return async ({ scope, application }) => {
		const reopen = (companion: Bot) => reopenOne(companion, application)
		const live = companionsIn(rosters(), scope).filter(
			(companion) => chat.stateFor(companion.id).sessionOpen,
		)
		for (const companion of live.filter(isMidTurn)) {
			void reopen(companion)
		}
		await Promise.all(
			live.filter((companion) => !isMidTurn(companion)).map(reopen),
		)
	}
}
