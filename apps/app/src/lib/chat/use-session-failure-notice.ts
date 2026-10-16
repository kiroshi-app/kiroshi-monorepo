import { type RefObject, useEffect, useRef } from "react"

import {
	endNotice,
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { describeTransportError } from "@/lib/agent/messages"
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
	onRestart?: () => void
	onSignIn?: () => void
}

type RaisedFailure = {
	errorId: string
	noticeId: Promise<string>
}

const transportMessageOf = (
	t: ChatCopy,
	{ error, onRestart, onSignIn }: FailureReading,
): NoticeMessage => {
	const title = noticeTitleFor(t, error.error)

	if (isSignedOut(error.error) && onSignIn) {
		return {
			title,
			description: t("screen.transport.notConnected"),
			action: { label: t("emptyState.signIn"), onPress: onSignIn },
		}
	}
	return {
		title,
		description: describeTransportError(t, error.error),
		action:
			needsFreshSession(error.error) && onRestart
				? { label: t("screen.restart"), onPress: onRestart }
				: undefined,
	}
}

let fadedFailureId: string | null = null

const fadeRefusedResume = (
	t: ChatCopy,
	error: ChatError,
	onDismiss: (id: string) => void,
) => {
	if (fadedFailureId === error.id) {
		return
	}
	fadedFailureId = error.id
	raiseTransientNotice({
		type: "warning",
		title: noticeTitleFor(t, error.error),
		description: describeTransportError(t, error.error),
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
			fadeRefusedResume(t, error, onDismiss)
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
					...transportMessageOf(t, { error, onRestart, onSignIn }),
					onClose: dismissUnlessReleased,
				},
				{ raisedIn: "use-session-failure-notice", ...context },
			),
		}
		raised.current = failure
	}, [errorId, error, context, onDismiss, onRestart, onSignIn, t])

	useEffect(() => () => release(raised), [])
}
