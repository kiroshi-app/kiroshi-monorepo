import { useEffect } from "react"

import type { SignInStep } from "./sign-in-steps"

import type { ChatController } from "../chat/chat-controller"

type PostedSignInStepInput = {
	controller: ChatController
	botId: string
	pendingId: string | null
	step: SignInStep | null
}

export const usePostedSignInStep = ({
	controller,
	botId,
	pendingId,
	step,
}: PostedSignInStepInput) => {
	useEffect(() => {
		if (pendingId && pendingId !== step?.request.id) {
			controller.withdrawQuestion(botId, pendingId)
		}
		if (step) {
			controller.postQuestion(botId, step.request, step.onAnswers)
		}
	}, [controller, botId, pendingId, step])
}
