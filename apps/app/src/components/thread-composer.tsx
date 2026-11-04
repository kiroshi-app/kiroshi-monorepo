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
import {
	type PromptAttachment,
	PromptAttachments,
	type PromptReplyAttachment,
} from "@workspace/ui/components/prompt-attachments"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptLibraryPicker } from "@workspace/ui/components/prompt-library-picker"

import { draftWithText } from "@/lib/chat/answer-actions"
import { holdsDismissal } from "@/lib/chat/prompt-commands"
import { promptWithMentionAdded } from "@/lib/conversations/mentions"
import type { ComposerLibrary } from "@/lib/library/use-composer-library"
import {
	composerOfflineOf,
	OpenJoinedHostContext,
} from "@/lib/spaces/open-joined-host"

export type PromptHandle = {
	mention: (name: string) => void
	insert: (text: string) => void
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
	attachments: PromptAttachment[]
	library?: ComposerLibrary
	canAttach: boolean
	isDisabled: boolean
	isDropTarget: boolean
	onAttach: (files: File[]) => void
	onRemoveAttachment: (id: string) => void
	replies: PromptReplyAttachment[]
	onRemoveReply: (messageId: string) => void
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
	library,
	canAttach,
	isDisabled,
	isDropTarget,
	onAttach,
	onRemoveAttachment,
	replies,
	onRemoveReply,
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
			const sent = await onSubmitPrompt(value)
			if (sent && latestPrompt.current.trim() === value) {
				changePrompt("")
			}
		},
		[changePrompt, onSubmitPrompt],
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
		}),
		[changePrompt, pick],
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
					<PromptAttachments
						items={attachments}
						onRemove={onRemoveAttachment}
					/>
				}
				disabled={isDisabled}
				dropTarget={isDropTarget}
				leading={
					library ? (
						<PromptLibraryPicker
							disabled={!canAttach}
							documents={library.documents}
							onAttach={onAttach}
							onPick={library.onPick}
						/>
					) : (
						<PromptAttachButton disabled={!canAttach} onAttach={onAttach} />
					)
				}
				offline={offline}
				onAttach={canAttach ? onAttach : undefined}
				onRemoveReply={onRemoveReply}
				onSubmit={submit}
				onValueChange={changePrompt}
				placeholder={placeholder}
				replies={replies}
				textareaRef={composerRef}
				value={prompt}
			/>
		),
	})
}
