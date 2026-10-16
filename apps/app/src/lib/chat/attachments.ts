import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import type { ChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type {
	AttachmentStoreError,
	SubmittedAttachment,
} from "./attachments-contract"
import { attachmentBlock } from "./message-attachments"

import { describeFailure } from "../failure-report"

export type StagedAttachment = PromptAttachment & {
	file: File
}

export const NO_ATTACHMENTS: StagedAttachment[] = []

const MEGABYTE = 1024 * 1024

function inMegabytes(t: ChatCopy, bytes: number): string {
	return t("screen.attachment.megabytes", {
		size: Math.round(bytes / MEGABYTE),
	})
}

function previewFor(file: File): string | undefined {
	return file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
}

export function stagedFrom(files: File[]): StagedAttachment[] {
	return files.map((file) => ({
		id: crypto.randomUUID(),
		name: file.name,
		size: file.size,
		previewUrl: previewFor(file),
		file,
	}))
}

export function releasePreviews(items: StagedAttachment[]): void {
	for (const item of items) {
		if (item.previewUrl) {
			URL.revokeObjectURL(item.previewUrl)
		}
	}
}

export function withoutStaged(
	items: StagedAttachment[],
	id: string,
): StagedAttachment[] {
	releasePreviews(items.filter((item) => item.id === id))
	return items.filter((item) => item.id !== id)
}

export function submittedFrom(
	items: StagedAttachment[],
): Promise<SubmittedAttachment[]> {
	return Promise.all(
		items.map(async (item) => ({
			name: item.name,
			bytes: new Uint8Array(await item.file.arrayBuffer()),
		})),
	)
}

export function promptWithAttachments(
	text: string,
	paths: string[],
	sentAt: Date,
): string {
	if (paths.length === 0) {
		return text
	}
	return [text.trim(), attachmentBlock(paths, sentAt)]
		.filter((part) => part.length > 0)
		.join("\n")
}

export function toAttachmentStoreError(reason: unknown): AttachmentStoreError {
	if (typeof reason === "object" && reason !== null && "kind" in reason) {
		return reason as AttachmentStoreError
	}
	return { kind: "unwritable", detail: describeFailure(reason) }
}

export function describeAttachmentError(
	t: ChatCopy,
	error: AttachmentStoreError,
): string {
	switch (error.kind) {
		case "unavailable":
		case "storage":
			return t("screen.attachment.storage", { failure: error.failure.kind })
		case "unknownConversation":
			return t("screen.attachment.unknownConversation")
		case "tooMany":
			return t("screen.attachment.tooMany", {
				limit: error.limit,
				staged: error.count,
			})
		case "tooLarge":
			return t("screen.attachment.tooLarge", {
				name: error.name,
				limit: inMegabytes(t, error.limit),
			})
		case "tooLargeTogether":
			return t("screen.attachment.tooLargeTogether", {
				bytes: inMegabytes(t, error.bytes),
				limit: inMegabytes(t, error.limit),
			})
		case "unwritable":
			return t("screen.attachment.unwritable", { detail: error.detail })
	}
}
