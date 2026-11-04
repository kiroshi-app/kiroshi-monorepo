import { type RefObject, useEffect, useMemo, useState } from "react"

import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"

import {
	NO_ATTACHMENTS,
	NO_DOCUMENTS,
	type StagedAttachment,
} from "./attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
} from "./attachments-contract"
import { type AttachmentsController, ownerKey } from "./attachments-controller"
import { watchConversationDrags } from "./conversation-drags"

import type { ReplyLink } from "../bindings"
import { useControllerState } from "../use-controller"

export type StagedFiles = {
	items: StagedAttachment[]
	documents: PromptAttachment[]
	refusal: AttachmentStoreError | null
	isDropTarget: boolean
	stage: (files: File[]) => void
	stageDocument: (document: PromptAttachment) => void
	remove: (id: string) => void
	submit: (text: string, replyLinks?: ReplyLink[]) => Promise<boolean>
	dismissRefusal: () => void
}

export function useAttachments(
	controller: AttachmentsController,
	owner: AttachmentsOwner,
	canAttach: boolean,
	conversation: RefObject<HTMLElement | null>,
): StagedFiles {
	const state = useControllerState(controller)
	const [isDropTarget, setIsDropTarget] = useState(false)
	const key = ownerKey(owner)

	const bound = useMemo(
		() => ({
			stage: (files: File[]) => controller.stage(owner, files),
			stageDocument: (document: PromptAttachment) =>
				controller.stageDocument(owner, document),
			remove: (id: string) => controller.remove(owner, id),
			submit: (text: string, replyLinks?: ReplyLink[]) =>
				controller.submit(owner, text, replyLinks),
			dismissRefusal: () => controller.dismissRefusal(owner),
		}),
		[controller, owner],
	)

	useEffect(() => controller.release, [controller])

	useEffect(
		() =>
			watchConversationDrags({
				conversation,
				onHover: setIsDropTarget,
				onDrop: (files) => {
					if (canAttach) {
						bound.stage(files)
					}
				},
			}),
		[canAttach, bound, conversation],
	)

	return {
		items: state.staged[key] ?? NO_ATTACHMENTS,
		documents: state.documents[key] ?? NO_DOCUMENTS,
		refusal: state.refusals[key] ?? null,
		isDropTarget,
		...bound,
	}
}
