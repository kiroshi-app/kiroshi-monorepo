import {
	Transcript,
	type TranscriptProps,
} from "@workspace/ui/components/transcript"

type HomeTranscriptProps = Pick<
	TranscriptProps,
	| "rows"
	| "transcriptKey"
	| "autoScroll"
	| "anchorOnSend"
	| "marksNewMessages"
	| "onFollowChange"
	| "label"
	| "busy"
	| "highlightedMessageId"
	| "older"
	| "newer"
	| "scrollerRef"
>

const HomeTranscript = (props: HomeTranscriptProps) => (
	<Transcript contentClassName="gap-4" {...props} />
)

export { HomeTranscript, type HomeTranscriptProps }
