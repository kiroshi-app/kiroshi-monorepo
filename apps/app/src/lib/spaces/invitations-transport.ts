import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import type { SpaceInvitationFailure } from "@workspace/ui/components/space-invitations"
import { i18n } from "@workspace/ui/lib/i18n"

import {
	commands,
	type Invitation,
	type InvitationError,
	JOIN_LINK_OPENED_EVENT,
	type JoinedSpace,
	type JoinedSpaceError,
	type JoinLinkOpened,
} from "../bindings"
import { describeFailure } from "../failure-report"
import { listenOnThisWindow } from "../host"
import { isJoinedSpaceError } from "../host/join-refusal"

export type InvitationsTransport = {
	list: () => Promise<Invitation[]>
	accept: (id: string) => Promise<JoinedSpace>
	decline: (id: string) => Promise<void>
	onJoinLinkOpened: (
		listener: (invitationId: string) => void,
	) => Promise<() => void>
	askForJoinLinks: () => Promise<void>
}

export type AcceptOutcome =
	| { kind: "joined"; joined: JoinedSpace }
	| { kind: "withdrawn" }
	| { kind: "expired" }
	| { kind: "failed"; failure: SpaceInvitationFailure }

export type DeclineOutcome = { kind: "declined" } | { kind: "withdrawn" }

type CommandResult<T, E> =
	| { status: "ok"; data: T }
	| { status: "error"; error: E }

const dataOf = <T, E>(result: CommandResult<T, E>): T => {
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

export const invitationsTransport: InvitationsTransport = {
	list: async () => dataOf(await commands.invitationsList()),
	accept: async (id) => dataOf(await commands.invitationAccept(id)),
	decline: async (id) => {
		dataOf(await commands.invitationDecline(id))
	},
	onJoinLinkOpened: (listener) =>
		listenOnThisWindow<JoinLinkOpened>(JOIN_LINK_OPENED_EVENT, ({ payload }) =>
			listener(payload.invitationId),
		),
	askForJoinLinks: () => commands.joinLinkListen(),
}

const isInvitationError = (reason: unknown): reason is InvitationError =>
	typeof reason === "object" && reason !== null && "kind" in reason

const describeInvitationError = (error: InvitationError): string => {
	if (error.kind === "storage") {
		return error.detail
	}
	if (error.kind === "offline" || error.kind === "serversUnreachable") {
		return error.reason
	}
	return error.kind
}

const describeRefusal = (reason: unknown): string => {
	if (isInvitationError(reason)) {
		return describeInvitationError(reason)
	}
	return describeFailure(reason)
}

export const refusalNoticeOf = (reason: unknown): NoticeMessage => ({
	title: i18n.t("chat:screen.notice.failed"),
	description: describeRefusal(reason),
})

const isSignedOut = (reason: unknown) =>
	isInvitationError(reason) && reason.kind === "notSignedIn"

const isWithdrawn = (reason: unknown) =>
	isInvitationError(reason) && reason.kind === "withdrawn"

const CLOSED_OUTCOMES: Partial<
	Record<JoinedSpaceError["kind"], AcceptOutcome>
> = {
	invitationWithdrawn: { kind: "withdrawn" },
	invitationUsed: { kind: "withdrawn" },
	invitationExpired: { kind: "expired" },
}

const closedOutcomeOf = (reason: unknown): AcceptOutcome | undefined =>
	isJoinedSpaceError(reason) ? CLOSED_OUTCOMES[reason.kind] : undefined

const ACCEPT_FAILURES: Partial<
	Record<JoinedSpaceError["kind"], SpaceInvitationFailure>
> = {
	couldNotAccept: "servers",
	relayUnreachable: "offline",
}

const acceptFailureOf = (
	reason: unknown,
): SpaceInvitationFailure | undefined =>
	isJoinedSpaceError(reason) ? ACCEPT_FAILURES[reason.kind] : undefined

const NO_INVITATIONS: Invitation[] = []

export const readInvitations = (transport: InvitationsTransport) =>
	transport.list().catch((reason: unknown) => {
		if (isSignedOut(reason)) return NO_INVITATIONS
		throw reason
	})

export const acceptOutcomeOf = async (
	transport: InvitationsTransport,
	id: string,
): Promise<AcceptOutcome> => {
	try {
		return { kind: "joined", joined: await transport.accept(id) }
	} catch (reason) {
		const closed = closedOutcomeOf(reason)
		if (closed) return closed
		const failure = acceptFailureOf(reason)
		if (failure) return { kind: "failed", failure }
		throw reason
	}
}

export const declineOutcomeOf = async (
	transport: InvitationsTransport,
	id: string,
): Promise<DeclineOutcome> => {
	try {
		await transport.decline(id)
		return { kind: "declined" }
	} catch (reason) {
		if (isWithdrawn(reason)) return { kind: "withdrawn" }
		throw reason
	}
}
