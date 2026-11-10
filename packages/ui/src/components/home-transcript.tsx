import {
	Transcript,
	type TranscriptProps,
} from "@workspace/ui/components/transcript"

type HomeTranscriptProps = Pick<
	TranscriptProps,
	| "rows"
	| "transcriptKey"
	| "autoScroll"
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
	<Transcript
		contentClassName="gap-4 [--transcript-row-bleed:0px] [--transcript-agent-bubble-width:--spacing(130)] [--transcript-bubble-padding:--spacing(3)]"
		{...props}
		anchorOnSend={false}
	/>
)

export { HomeTranscript, type HomeTranscriptProps }
