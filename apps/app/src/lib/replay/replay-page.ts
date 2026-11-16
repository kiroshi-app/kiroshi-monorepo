import { isTauri } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

import { runReplayCommand } from "./replay-commands"
import {
	REPLAY_ANSWER_EVENT,
	REPLAY_COMMAND_EVENT,
	type ReplayAnswer,
	type ReplayRequest,
} from "./replay-protocol"
import { recordAnnouncedRouters } from "./replay-router"

import { MAIN_WINDOW_LABEL } from "@/lib/tabs/tabs-mirror"

type ReplayHot = {
	on: (event: string, listener: (request: ReplayRequest) => void) => void
	send: (event: string, answer: ReplayAnswer) => void
}

const reportAnswerFailure = (reason: unknown) => {
	console.error("replay answer failed", reason)
}

export const answerReplayCommands = (
	hot: ReplayHot,
	windowLabel: string | undefined,
) => {
	if (windowLabel !== MAIN_WINDOW_LABEL) {
		return
	}
	const findRenderedRouter = recordAnnouncedRouters()
	hot.on(REPLAY_COMMAND_EVENT, ({ id, command }) => {
		runReplayCommand(command, findRenderedRouter)
			.then((outcome) => hot.send(REPLAY_ANSWER_EVENT, { id, outcome }))
			.catch(reportAnswerFailure)
	})
}

if (import.meta.hot) {
	answerReplayCommands(
		import.meta.hot,
		isTauri() ? getCurrentWebviewWindow().label : undefined,
	)
}
