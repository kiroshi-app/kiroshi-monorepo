import { i18n } from "@workspace/ui/lib/i18n"

import type { BotChat, BotTransition, TransitionKind } from "./bot-chat"
import type { ChatContext } from "./chat-context"
import type { ConversationOpening } from "./conversation-opening"
import type { SessionRunner } from "./session-runner"

const openKind = (spaceId: string | null): TransitionKind => `open:${spaceId}`

type BotTransitionsParts = {
	openConversation: ConversationOpening["openConversation"]
	openedFor: SessionRunner["openedFor"]
	pump: (bot: BotChat) => void
}

export const createBotTransitions = (
	{
		driver,
		bots,
		transitions,
		botFor,
		publish,
		report,
		reportFailure,
	}: ChatContext,
	{ openConversation, openedFor, pump }: BotTransitionsParts,
) => {
	let chosenBotId: string | null = null

	const chosenBot = () =>
		chosenBotId === null ? null : (bots.get(chosenBotId) ?? null)

	const runOpen = async (nextBotId: string, spaceId: string | null) => {
		const bot = botFor(nextBotId)
		const landed = openConversation(bot, spaceId)
		bot.opening = { kind: openKind(spaceId), landed }
		await landed
		const handle = await openedFor(bot)
		pump(bot)
		return handle
	}

	const runClose = async (botId: string) => {
		const bot = bots.get(botId)
		if (!bot) {
			return
		}
		bots.delete(botId)
		publish()
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch((reason: unknown) => {
			void reportFailure(
				{ title: i18n.t("chat:screen.notice.failed") },
				{ reason, botId },
			)
		})
	}

	const forget = (botId: string, transition: BotTransition) => {
		if (transitions.get(botId) === transition) {
			transitions.delete(botId)
		}
	}

	const transitionFor = <T>(
		botId: string,
		kind: TransitionKind,
		run: () => Promise<T>,
	) => {
		const inFlight = transitions.get(botId)
		if (inFlight?.kind === kind) {
			return inFlight.settled as Promise<T>
		}
		const settled = (inFlight?.settled ?? Promise.resolve()).then(run, run)
		const transition: BotTransition = { kind, settled }
		transitions.set(botId, transition)
		const drop = () => forget(botId, transition)
		settled.then(drop, drop)
		return settled
	}

	const choose = (botId: string | null) => {
		chosenBotId = botId
		publish()
	}

	const openAside = (botId: string, spaceId: string | null) =>
		transitionFor(botId, openKind(spaceId), () => runOpen(botId, spaceId))

	const open = (botId: string, spaceId: string | null) => {
		choose(botId)
		return openAside(botId, spaceId)
	}

	const close = (botId: string) => {
		if (chosenBotId === botId) {
			choose(null)
		}
		return transitionFor(botId, "close", () => runClose(botId))
	}

	const shutdown = async (bot: BotChat) => {
		const runtime = bot.state.runtime
		if (!runtime) {
			return
		}
		await driver.shutdown(runtime).catch((reason) => report(bot, reason))
	}

	const onSelected = <T>(
		ask: (bot: BotChat) => Promise<T>,
		nothing: T,
	): Promise<T> => {
		const bot = chosenBot()
		return bot ? ask(bot) : Promise.resolve(nothing)
	}

	const forSelected = (act: (bot: BotChat) => void) => {
		const bot = chosenBot()
		if (bot) {
			act(bot)
		}
	}

	return {
		chosenBot,
		open,
		openAside,
		close,
		shutdown,
		onSelected,
		forSelected,
	}
}
