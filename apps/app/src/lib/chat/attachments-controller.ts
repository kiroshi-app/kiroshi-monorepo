import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"

import {
	NO_ATTACHMENTS,
	NO_DOCUMENTS,
	promptWithAttachments,
	releasePreviews,
	type StagedAttachment,
	stagedFrom,
	submittedFrom,
	toAttachmentStoreError,
	withoutStaged,
} from "./attachments"
import type {
	AttachmentStoreError,
	AttachmentsOwner,
	SubmittedAttachment,
	ThreadOwner,
} from "./attachments-contract"

import type { ReplyLink } from "../bindings"
import { createStore } from "../store"

export type AttachmentsState = {
	staged: Record<string, StagedAttachment[]>
	documents: Record<string, PromptAttachment[]>
	refusals: Record<string, AttachmentStoreError | null>
}

export type AttachmentsPort = {
	store: (
		owner: ThreadOwner,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	send: (
		owner: ThreadOwner,
		text: string,
		replyLinks?: ReplyLink[],
		documents?: string[],
	) => boolean | Promise<boolean>
}

export type AttachmentsController = {
	getState: () => AttachmentsState
	subscribe: (listener: () => void) => () => void
	stage: (owner: AttachmentsOwner, files: File[]) => void
	stageDocument: (owner: AttachmentsOwner, document: PromptAttachment) => void
	remove: (owner: AttachmentsOwner, id: string) => void
	dismissRefusal: (owner: AttachmentsOwner) => void
	submit: (
		owner: ThreadOwner,
		text: string,
		replyLinks?: ReplyLink[],
	) => Promise<boolean>
	submitTo: (
		staging: AttachmentsOwner,
		target: ThreadOwner,
		text: string,
	) => Promise<boolean>
	forget: (owner: AttachmentsOwner) => void
	release: () => void
}

export const ownerKey = (owner: AttachmentsOwner) => `${owner.kind}:${owner.id}`

type Delivery = (
	target: ThreadOwner,
	text: string,
	replyLinks?: ReplyLink[],
	documents?: string[],
) => boolean | Promise<boolean>

type Submission = {
	staging: AttachmentsOwner
	target: ThreadOwner
	text: string
	replyLinks?: ReplyLink[]
	deliver: Delivery
}

export function createAttachmentsController(
	port: AttachmentsPort,
): AttachmentsController {
	const stateStore = createStore<AttachmentsState>({
		staged: {},
		documents: {},
		refusals: {},
	})
	const current = stateStore.getState

	const sending = new Set<string>()

	const stagedFor = (owner: AttachmentsOwner) =>
		current().staged[ownerKey(owner)] ?? NO_ATTACHMENTS

	const hold = (owner: AttachmentsOwner, items: StagedAttachment[]) => {
		const state = current()
		stateStore.setState({
			...state,
			staged: { ...state.staged, [ownerKey(owner)]: items },
		})
	}

	const documentsFor = (owner: AttachmentsOwner) =>
		current().documents[ownerKey(owner)] ?? NO_DOCUMENTS

	const holdDocuments = (
		owner: AttachmentsOwner,
		documents: PromptAttachment[],
	) => {
		const state = current()
		stateStore.setState({
			...state,
			documents: { ...state.documents, [ownerKey(owner)]: documents },
		})
	}

	const withDocuments = (
		owner: AttachmentsOwner,
		added: PromptAttachment[],
	) => {
		const held = documentsFor(owner)
		const heldIds = new Set(held.map(({ id }) => id))
		return [...held, ...added.filter(({ id }) => !heldIds.has(id))]
	}

	const takenBy: Delivery = (target, text, replyLinks, documents) =>
		port.send(target, text, replyLinks, documents) !== false

	const sendWithDocuments = async (
		{ staging, target, replyLinks, deliver }: Submission,
		text: string,
	) => {
		const documents = documentsFor(staging)
		const isTaken = await deliver(
			target,
			text,
			replyLinks,
			documents.map(({ id }) => id),
		)
		if (!isTaken) {
			return false
		}
		holdDocuments(staging, NO_DOCUMENTS)
		return true
	}

	const holdRefusal = (
		owner: AttachmentsOwner,
		refusal: AttachmentStoreError | null,
	) => {
		const key = ownerKey(owner)
		const state = current()
		if ((state.refusals[key] ?? null) === refusal) {
			return
		}
		stateStore.setState({
			...state,
			refusals: { ...state.refusals, [key]: refusal },
		})
	}

	const dropSent = (owner: AttachmentsOwner, sent: StagedAttachment[]) => {
		const ids = new Set(sent.map((item) => item.id))
		hold(
			owner,
			stagedFor(owner).filter((item) => !ids.has(item.id)),
		)
	}

	const submitStaged = async (submission: Submission) => {
		const { staging, target, text } = submission
		const key = ownerKey(staging)
		if (sending.has(key)) {
			return false
		}
		const items = stagedFor(staging)
		if (items.length === 0) {
			holdRefusal(staging, null)
			return sendWithDocuments(submission, text)
		}

		const sentAt = new Date()
		sending.add(key)
		let paths: string[]
		try {
			paths = await port.store(target, await submittedFrom(items))
		} catch (reason) {
			holdRefusal(staging, toAttachmentStoreError(reason))
			return false
		} finally {
			sending.delete(key)
		}

		if (
			!(await sendWithDocuments(
				submission,
				promptWithAttachments(text, paths, sentAt),
			))
		) {
			return false
		}

		releasePreviews(items)
		dropSent(staging, items)
		holdRefusal(staging, null)
		return true
	}

	return {
		getState: current,
		subscribe: stateStore.subscribe,

		stage: (owner, files) => {
			if (files.length === 0) {
				return
			}
			hold(owner, [...stagedFor(owner), ...stagedFrom(files)])
		},

		stageDocument: (owner, document) =>
			holdDocuments(owner, withDocuments(owner, [document])),

		remove: (owner, id) => {
			hold(owner, withoutStaged(stagedFor(owner), id))
			holdDocuments(
				owner,
				documentsFor(owner).filter((document) => document.id !== id),
			)
		},

		dismissRefusal: (owner) => holdRefusal(owner, null),

		submit: (owner, text, replyLinks) =>
			submitStaged({
				staging: owner,
				target: owner,
				text,
				replyLinks,
				deliver: takenBy,
			}),

		submitTo: (staging, target, text) =>
			submitStaged({ staging, target, text, deliver: port.send }),

		forget: (owner) => {
			const key = ownerKey(owner)
			releasePreviews(stagedFor(owner))
			const { staged, documents, refusals } = current()
			stateStore.setState({
				staged: { ...staged, [key]: NO_ATTACHMENTS },
				documents: { ...documents, [key]: NO_DOCUMENTS },
				refusals: { ...refusals, [key]: null },
			})
		},

		release: () => {
			for (const items of Object.values(current().staged)) {
				releasePreviews(items)
			}
			stateStore.setState({ staged: {}, documents: {}, refusals: {} })
		},
	}
}
