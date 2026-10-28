import { type RefObject, useEffect, useRef } from "react"

import {
	endNotice,
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { agentNameOf, describeTransportError } from "@/lib/agent/messages"
import type { ChatError } from "@/lib/chat/chat-state"
import {
	isSignedOut,
	needsFreshSession,
	noticeTitleFor,
} from "@/lib/chat/screen-model"
import {
	type FailureCorrelation,
	raiseReportedFailure,
} from "@/lib/failure-report"
import { isHostOffline } from "@/lib/host/host-offline"

type SessionFailure = {
	error: ChatError | undefined
	context: FailureCorrelation
	onDismiss: (id: string) => void
	onRestart?: () => void
	onSignIn?: () => void
}

type FailureReading = {
	error: ChatError
	botName?: string
	onRestart?: () => void
	onSignIn?: () => void
}

type RaisedFailure = {
	errorId: string
	noticeId: Promise<string>
}

const stopFailureTitleOf = (t: ChatCopy, botName: string | undefined) => {
	const name = agentNameOf(botName)
	return name
		? t("screen.notice.stopFailedNamed", { name })
		: t("screen.notice.stopFailed")
}

const titleOf = (t: ChatCopy, error: ChatError, botName: string | undefined) =>
	error.isStopFailure
		? stopFailureTitleOf(t, botName)
		: noticeTitleFor(t, error.error, botName)

const sessionMessageOf = (
	t: ChatCopy,
	{ error, botName, onRestart, onSignIn }: FailureReading,
): NoticeMessage => {
	const title = titleOf(t, error, botName)

	if (isSignedOut(error.error) && onSignIn) {
		return {
			title,
			description: t("screen.transport.notConnected"),
			action: { label: t("emptyState.signIn"), onPress: onSignIn },
		}
	}
	return {
		title,
		description: describeTransportError(t, error.error, botName),
		action:
			needsFreshSession(error.error) && onRestart
				? { label: t("screen.restart"), onPress: onRestart }
				: undefined,
	}
}

const questionRunCopyOf = (t: ChatCopy, botName: string) => ({
	title: t("screen.notice.questionRunFailed.title", { name: botName }),
	description: t("screen.notice.questionRunFailed.description"),
})

const transportMessageOf = (
	t: ChatCopy,
	reading: FailureReading,
): NoticeMessage => {
	const message = sessionMessageOf(t, reading)
	return reading.error.isQuestionRunFailure && reading.botName
		? { ...message, ...questionRunCopyOf(t, reading.botName) }
		: message
}

let fadedFailureId: string | null = null

const fadeRefusedResume = (
	t: ChatCopy,
	{ error, botName }: FailureReading,
	onDismiss: (id: string) => void,
) => {
	if (fadedFailureId === error.id) {
		return
	}
	fadedFailureId = error.id
	raiseTransientNotice({
		type: "warning",
		title: noticeTitleFor(t, error.error, botName),
		description: describeTransportError(t, error.error, botName),
	})
	onDismiss(error.id)
}

const release = (raised: RefObject<RaisedFailure | null>) => {
	const current = raised.current
	raised.current = null
	if (current) {
		void current.noticeId.then(endNotice)
	}
}

export const useSessionFailureNotice = ({
	error,
	context,
	onDismiss,
	onRestart,
	onSignIn,
}: SessionFailure): void => {
	const t = useChatCopy()
	const raised = useRef<RaisedFailure | null>(null)
	const errorId = error?.id ?? null

	useEffect(() => {
		if (raised.current?.errorId === errorId) {
			return
		}
		release(raised)
		if (!error) {
			return
		}
		if (
			error.error.kind === "serverEnvRejected" ||
			isHostOffline(error.error)
		) {
			return
		}
		if (error.error.kind === "resumeFailed") {
			fadeRefusedResume(t, { error, botName: context.botName }, onDismiss)
			return
		}
		const dismissUnlessReleased = () => {
			if (raised.current !== failure) {
				return
			}
			raised.current = null
			onDismiss(error.id)
		}
		const failure: RaisedFailure = {
			errorId: error.id,
			noticeId: raiseReportedFailure(
				{
					...transportMessageOf(t, {
						error,
						botName: context.botName,
						onRestart,
						onSignIn,
					}),
					onClose: dismissUnlessReleased,
				},
				{ raisedIn: "use-session-failure-notice", ...context },
			),
		}
		raised.current = failure
	}, [errorId, error, context, onDismiss, onRestart, onSignIn, t])

	useEffect(() => () => release(raised), [])
}
