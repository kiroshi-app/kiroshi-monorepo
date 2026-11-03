import {
	NO_ATTACHMENTS,
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
} from "./attachments-contract"

import type { ReplyLink } from "../bindings"
import { createStore } from "../store"

export type AttachmentsState = {
	staged: Record<string, StagedAttachment[]>
	refusals: Record<string, AttachmentStoreError | null>
}

export type AttachmentsPort = {
	store: (
		owner: AttachmentsOwner,
		attachments: SubmittedAttachment[],
	) => Promise<string[]>
	send: (
		owner: AttachmentsOwner,
		text: string,
		replyLinks?: ReplyLink[],
	) => boolean
}

export type AttachmentsController = {
	getState: () => AttachmentsState
	subscribe: (listener: () => void) => () => void
	stage: (owner: AttachmentsOwner, files: File[]) => void
	remove: (owner: AttachmentsOwner, id: string) => void
	dismissRefusal: (owner: AttachmentsOwner) => void
	submit: (
		owner: AttachmentsOwner,
		text: string,
		replyLinks?: ReplyLink[],
	) => Promise<boolean>
	forget: (owner: AttachmentsOwner) => void
	release: () => void
}

export const ownerKey = (owner: AttachmentsOwner) => `${owner.kind}:${owner.id}`

export function createAttachmentsController(
	port: AttachmentsPort,
): AttachmentsController {
	const stateStore = createStore<AttachmentsState>({ staged: {}, refusals: {} })
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

	const submit = async (
		owner: AttachmentsOwner,
		text: string,
		replyLinks?: ReplyLink[],
	) => {
		const key = ownerKey(owner)
		if (sending.has(key)) {
			return false
		}
		const items = stagedFor(owner)
		if (items.length === 0) {
			holdRefusal(owner, null)
			return port.send(owner, text, replyLinks)
		}

		const sentAt = new Date()
		sending.add(key)
		let paths: string[]
		try {
			paths = await port.store(owner, await submittedFrom(items))
		} catch (reason) {
			holdRefusal(owner, toAttachmentStoreError(reason))
			return false
		} finally {
			sending.delete(key)
		}

		if (
			!port.send(owner, promptWithAttachments(text, paths, sentAt), replyLinks)
		) {
			return false
		}

		releasePreviews(items)
		dropSent(owner, items)
		holdRefusal(owner, null)
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

		remove: (owner, id) => hold(owner, withoutStaged(stagedFor(owner), id)),

		dismissRefusal: (owner) => holdRefusal(owner, null),

		submit,

		forget: (owner) => {
			const key = ownerKey(owner)
			releasePreviews(stagedFor(owner))
			const { staged, refusals } = current()
			stateStore.setState({
				staged: { ...staged, [key]: NO_ATTACHMENTS },
				refusals: { ...refusals, [key]: null },
			})
		},

		release: () => {
			for (const items of Object.values(current().staged)) {
				releasePreviews(items)
			}
			stateStore.setState({ staged: {}, refusals: {} })
		},
	}
}
