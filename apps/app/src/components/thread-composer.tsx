import {
	type ReactNode,
	type RefObject,
	useCallback,
	useContext,
	useImperativeHandle,
	useRef,
	useState,
} from "react"

import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import { PromptAttachments } from "@workspace/ui/components/prompt-attachments"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { SelectionQuote } from "@workspace/ui/components/selection-quote"

import {
	draftWithText,
	type QuotedSelection,
	quotedMessage,
} from "@/lib/chat/answer-actions"
import type { StagedAttachment } from "@/lib/chat/attachments"
import { holdsDismissal } from "@/lib/chat/prompt-commands"
import { promptWithMentionAdded } from "@/lib/conversations/mentions"
import {
	composerOfflineOf,
	OpenJoinedHostContext,
} from "@/lib/spaces/open-joined-host"

export type PromptHandle = {
	mention: (name: string) => void
	insert: (text: string) => void
	quote: (selection: QuotedSelection) => void
}

export type ThreadMenuSlot = {
	prompt: string
	query: string
	isOpen: boolean
	onDismiss: () => void
	onPick: (text: string) => void
	children: ReactNode
}

type ThreadComposerProps = {
	attachments: StagedAttachment[]
	canAttach: boolean
	isDisabled: boolean
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	composerRef: RefObject<HTMLTextAreaElement | null>
	promptRef?: RefObject<PromptHandle | null>
	readDraft: () => string
	onPromptChange: (draft: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
	placeholder: string
	queryIn: (prompt: string) => string | null
	menu: (slot: ThreadMenuSlot) => ReactNode
}

export const ThreadComposer = ({
	attachments,
	canAttach,
	isDisabled,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	composerRef,
	promptRef,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
	placeholder,
	queryIn,
	menu,
}: ThreadComposerProps) => {
	const offline = composerOfflineOf(useContext(OpenJoinedHostContext))
	const [prompt, setPrompt] = useState(readDraft)
	const [wasDismissed, setWasDismissed] = useState(false)
	const [quoted, setQuoted] = useState<QuotedSelection | null>(null)
	const latestPrompt = useRef(prompt)

	const query = queryIn(prompt)
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const changePrompt = useCallback(
		(next: string) => {
			latestPrompt.current = next
			setPrompt(next)
			onPromptChange(next)
		},
		[onPromptChange],
	)

	const submit = useCallback(
		async (value: string) => {
			const sent = await onSubmitPrompt(
				quoted ? quotedMessage(quoted.text, value) : value,
			)
			if (sent) setQuoted(null)
			if (sent && latestPrompt.current.trim() === value) {
				changePrompt("")
			}
		},
		[changePrompt, onSubmitPrompt, quoted],
	)

	const pick = useCallback(
		(text: string) => {
			changePrompt(text)
			composerRef.current?.focus({ preventScroll: true })
		},
		[changePrompt, composerRef],
	)

	useImperativeHandle(
		promptRef,
		() => ({
			mention: (name: string) =>
				pick(promptWithMentionAdded(latestPrompt.current, name)),
			insert: (text: string) =>
				changePrompt(draftWithText(latestPrompt.current, text)),
			quote: (selection: QuotedSelection) => {
				setQuoted(selection)
				composerRef.current?.focus({ preventScroll: true })
			},
		}),
		[changePrompt, composerRef, pick],
	)

	return menu({
		prompt,
		query: query ?? "",
		isOpen: query !== null && !isDismissed,
		onDismiss: () => setWasDismissed(true),
		onPick: pick,
		children: (
			<PromptInput
				attachments={
					<>
						{quoted ? (
							<SelectionQuote
								agentName={quoted.agentName}
								onRemove={() => setQuoted(null)}
								text={quoted.text}
							/>
						) : null}
						<PromptAttachments
							items={attachments}
							onRemove={onRemoveAttachment}
						/>
					</>
				}
				disabled={isDisabled}
				dropTarget={isDropTarget}
				leading={
					<PromptAttachButton disabled={!canAttach} onAttach={onAttach} />
				}
				offline={offline}
				onAttach={canAttach ? onAttach : undefined}
				onSubmit={submit}
				onValueChange={changePrompt}
				placeholder={placeholder}
				textareaRef={composerRef}
				value={prompt}
			/>
		),
	})
}
