"use client"

import { useTranslation } from "react-i18next"

import {
	Callout,
	type CalloutTone,
} from "@workspace/ui/components/answer-blocks/callout"
import {
	calloutTextOf,
	calloutTitleOf,
	calloutToneOf,
	type SourceEdit,
	withCalloutText,
	withCalloutTone,
} from "@workspace/ui/components/library-document-blocks"
import { GrowingField } from "@workspace/ui/components/library-document-view"
import { AnswerBlockFrame } from "@workspace/ui/components/markdown/answer-block"
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@workspace/ui/components/ui/toggle-group"

type LibraryCalloutEditorProps = {
	source: string
	onEdit: SourceEdit
}

const TONES: readonly CalloutTone[] = ["note", "tip", "warning"]

const LibraryCalloutEditor = ({
	source,
	onEdit,
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
					<GrowingField
						aria-label={t("library.editor.blocks.callout.text")}
						className="w-full"
						data-slot="library-document-block-field"
						fieldClassName="w-full"
						onChange={(event) =>
							onEdit((current) => withCalloutText(current, event.target.value))
						}
						value={calloutTextOf(source)}
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
