import { useCallback, useEffect, useRef, useState } from "react"

import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type { TranscriptMessage } from "@/lib/conversations/transcript-contract"
import { raiseReportedFailure } from "@/lib/failure-report"
import type { MessageLanding } from "@/lib/search/message-landing-controller"

export type MessageLandingRequest = {
	landing: MessageLanding | null
	conversationId: string | null
	messages: TranscriptMessage[]
	landOn: (seq: number) => Promise<TranscriptMessage[]>
	onLand: (messageId: string) => boolean
	onTaken: (landing: MessageLanding) => void
}

const holds = (messages: TranscriptMessage[], messageId: string) =>
	messages.some((message) => message.id === messageId)

export const useMessageLanding = ({
	landing,
	conversationId,
	messages,
	landOn,
	onLand,
	onTaken,
}: MessageLandingRequest) => {
	const t = useChatCopy()
	const requested = useRef<MessageLanding | null>(null)
	const [read, setRead] = useState<MessageLanding | null>(null)
	const shown = landing?.conversationId === conversationId ? landing : null

	const giveUp = useCallback(
		(taken: MessageLanding) => {
			onTaken(taken)
			raiseReportedFailure(
				{
					title: t("transcript.landing.unavailable.title"),
					description: t("transcript.landing.unavailable.description"),
				},
				{
					raisedIn: "use-message-landing",
					conversation: taken.conversationId,
				},
			)
		},
		[onTaken, t],
	)

	useEffect(() => {
		if (!shown || requested.current === shown) {
			return
		}
		requested.current = shown
		const isSuperseded = () => requested.current !== shown
		landOn(shown.seq).then(
			(window) => {
				if (isSuperseded()) {
					return
				}
				if (holds(window, shown.messageId)) {
					setRead(shown)
					return
				}
				giveUp(shown)
			},
			() => {
				if (isSuperseded()) {
					return
				}
				giveUp(shown)
			},
		)
	}, [shown, landOn, giveUp])

	useEffect(() => {
		if (!shown) {
			return
		}
		return () => onTaken(shown)
	}, [shown, onTaken])

	useEffect(() => {
		if (!read || !holds(messages, read.messageId)) {
			return
		}
		setRead(null)
		onTaken(read)
		if (!onLand(read.messageId)) {
			giveUp(read)
		}
	}, [read, messages, onLand, onTaken, giveUp])
}
