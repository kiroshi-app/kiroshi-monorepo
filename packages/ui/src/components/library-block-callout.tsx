"use client"

import { useTranslation } from "react-i18next"

import {
	Callout,
	type CalloutTone,
} from "@workspace/ui/components/answer-blocks/callout"
import { LibraryBlockText } from "@workspace/ui/components/library-block-text"
import {
	calloutTextOf,
	calloutTitleOf,
	calloutToneOf,
	type SourceEdit,
	withCalloutText,
	withCalloutTone,
} from "@workspace/ui/components/library-document-blocks"
import { AnswerBlockFrame } from "@workspace/ui/components/markdown/answer-block"
import type { MarkdownRunRenderer } from "@workspace/ui/components/markdown/run"
import type { MarkdownRun } from "@workspace/ui/components/markdown/runs"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"

type LibraryCalloutEditorProps = {
	source: string
	onEdit: SourceEdit
	runs?: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
}

const TONES: readonly CalloutTone[] = ["note", "tip", "warning"]

const NO_RUNS: MarkdownRun[] = []

const textOffsetOf = (source: string, offset: number) =>
	calloutTextOf(source.slice(0, offset)).length

const textRunsOf = (source: string, runs: MarkdownRun[]) =>
	runs.flatMap(({ id, start, end }) => {
		const run = {
			id,
			start: textOffsetOf(source, start),
			end: textOffsetOf(source, end),
		}
		return run.start < run.end ? [run] : []
	})

const LibraryCalloutEditor = ({
	source,
	onEdit,
	runs = NO_RUNS,
	renderRun,
}: LibraryCalloutEditorProps) => {
	const { t } = useTranslation("common")
	const { t: tChat } = useTranslation("chat")
	const tone = calloutToneOf(source)

	return (
		<AnswerBlockFrame>
			<Callout
				title={calloutTitleOf(source) || tChat(`answerBlock.callout.${tone}`)}
				tone={tone}
			>
				<span className="flex flex-col items-start gap-2">
					<LibraryBlockText
						aria-label={t("library.editor.blocks.callout.text")}
						className="w-full"
						data-slot="library-document-block-field"
						onEdit={(text) =>
							onEdit((current) => withCalloutText(current, text))
						}
						renderRun={renderRun}
						runs={textRunsOf(source, runs)}
						source={calloutTextOf(source)}
						type="paragraph"
					/>
					<ToggleGroup
						aria-label={t("library.editor.blocks.callout.tone")}
						className="rounded-full bg-card/70 p-[3px]"
						data-slot="library-callout-tones"
						onValueChange={([chosen]) => {
							const next = TONES.find((each) => each === chosen)
							if (next && next !== tone)
								onEdit((current) => withCalloutTone(current, next))
						}}
						spacing={1}
						value={[tone]}
					>
						{TONES.map((each) => (
							<ToggleGroupItem
								className="h-6 min-w-0 rounded-full p-1 font-medium text-muted-foreground text-xs leading-4 transition-none hover:bg-transparent hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:inset-ring aria-pressed:inset-ring-foreground/8"
								key={each}
								value={each}
							>
								{tChat(`answerBlock.callout.${each}`)}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</span>
			</Callout>
		</AnswerBlockFrame>
	)
}

export { LibraryCalloutEditor }
