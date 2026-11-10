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
		contentClassName="gap-4 [--transcript-row-bleed:0px]"
		{...props}
		anchorOnSend={false}
	/>
)

export { HomeTranscript, type HomeTranscriptProps }
