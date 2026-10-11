import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import type {
	SpaceInvitation,
	SpaceInvitationFailure,
} from "@workspace/ui/components/space-invitations"
import { i18n } from "@workspace/ui/lib/i18n"

import type { JoinedSpacesController } from "./joined-spaces-controller"

import {
	commands,
	INVITATION_CHANGED_EVENT,
	type Invitation,
	type InvitationError,
	type InvitationsChanged,
	type JoinedSpace,
} from "../bindings"
import { failureReporterIn } from "../failure-report"
import { listen } from "../host"
import { createStore } from "../store"

type InvitationStatus =
	| { state: "accepting" | "withdrawn" }
	| { state: "failed"; failure: SpaceInvitationFailure }

export type InvitationsState = {
	invitations: Invitation[]
	statuses: Record<string, InvitationStatus>
}

export type InvitationsController = {
	getState: () => InvitationsState
	subscribe: (listener: () => void) => () => void
	watch: () => () => void
	accept: (id: string) => Promise<void>
	decline: (id: string) => Promise<void>
	sweepWithdrawn: () => void
}

export type InvitationsTransport = {
	list: () => Promise<Invitation[]>
	accept: (id: string) => Promise<JoinedSpace>
	decline: (id: string) => Promise<void>
	onChanged: (
		listener: (invitations: Invitation[]) => void,
	) => Promise<() => void>
}

type InvitationsControllerOptions = {
	joinedSpaces: Pick<JoinedSpacesController, "admit">
	transport?: InvitationsTransport
	reportFailure?: (notice: NoticeMessage) => void
}

type CommandResult<T> =
	| { status: "ok"; data: T }
	| { status: "error"; error: InvitationError }

const dataOf = <T>(result: CommandResult<T>): T => {
	if (result.status === "error") {
		throw result.error
	}
	return result.data
}

const invitationsTransport: InvitationsTransport = {
	list: async () => dataOf(await commands.invitationsList()),
	accept: async (id) => dataOf(await commands.invitationAccept(id)),
	decline: async (id) => {
		dataOf(await commands.invitationDecline(id))
	},
	onChanged: (listener) =>
		listen<InvitationsChanged>(INVITATION_CHANGED_EVENT, ({ payload }) =>
			listener(payload.invitations),
		),
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
	return reason instanceof Error ? reason.message : String(reason)
}

const isSignedOut = (reason: unknown) =>
	isInvitationError(reason) && reason.kind === "notSignedIn"

const isWithdrawn = (reason: unknown) =>
	isInvitationError(reason) && reason.kind === "withdrawn"

const ACCEPT_FAILURES: Partial<
	Record<InvitationError["kind"], SpaceInvitationFailure>
> = {
	serversUnreachable: "servers",
	offline: "offline",
}

const acceptFailureOf = (
	reason: unknown,
): SpaceInvitationFailure | undefined =>
	isInvitationError(reason) ? ACCEPT_FAILURES[reason.kind] : undefined

const WAITING = { state: "waiting" } as const

export const invitationRowsOf = ({
	invitations,
	statuses,
}: InvitationsState): SpaceInvitation[] =>
	invitations.map((invitation) => ({
		id: invitation.instanceId,
		name: invitation.instanceName,
		hostEmail: invitation.inviterEmail,
		...(statuses[invitation.instanceId] ?? WAITING),
	}))

const initialInvitationsState: InvitationsState = {
	invitations: [],
	statuses: {},
}

export const createInvitationsController = ({
	joinedSpaces,
	transport = invitationsTransport,
	reportFailure = failureReporterIn("invitations-controller"),
}: InvitationsControllerOptions): InvitationsController => {
	const stateStore = createStore(initialInvitationsState)
	const current = stateStore.getState
	let latestRead = 0
	let swept: Invitation[] = []

	const set = (fields: Partial<InvitationsState>) =>
		stateStore.setState({ ...current(), ...fields })

	const reportRefusal = (reason: unknown) =>
		reportFailure({
			title: i18n.t("chat:screen.notice.failed"),
			description: describeRefusal(reason),
		})

	const statusesOf = (invitations: Invitation[]) =>
		Object.fromEntries(
			Object.entries(current().statuses).filter(([id]) =>
				invitations.some((invitation) => invitation.instanceId === id),
			),
		)

	const show = (invitations: Invitation[]) =>
		set({ invitations, statuses: statusesOf(invitations) })

	const isAccepting = (id: string) =>
		current().statuses[id]?.state === "accepting"

	const isSwept = (invitation: Invitation) =>
		swept.some(
			({ instanceId, invitedAt }) =>
				instanceId === invitation.instanceId &&
				invitedAt === invitation.invitedAt,
		)

	const refresh = (received: Invitation[]) => {
		latestRead += 1
		const listed = received.filter((invitation) => !isSwept(invitation))
		const isListed = (id: string) =>
			listed.some((invitation) => invitation.instanceId === id)
		const stillAccepting = current().invitations.filter(
			({ instanceId }) => isAccepting(instanceId) && !isListed(instanceId),
		)
		show([...listed, ...stillAccepting])
	}

	const read = async () => {
		latestRead += 1
		const ticket = latestRead
		try {
			const listed = await transport.list()
			if (ticket === latestRead) refresh(listed)
		} catch (reason) {
			if (!isSignedOut(reason)) reportRefusal(reason)
		}
	}

	const watch = () => {
		void read()
		const detach = transport.onChanged(refresh).catch((reason: unknown) => {
			reportRefusal(reason)
			return undefined
		})
		return () => {
			void detach.then((unlisten) => unlisten?.())
		}
	}

	const mark = (id: string, status: InvitationStatus | null) => {
		const { [id]: _previous, ...statuses } = current().statuses
		set({ statuses: status ? { ...statuses, [id]: status } : statuses })
	}

	const drop = (id: string) =>
		show(
			current().invitations.filter(
				(invitation) => invitation.instanceId !== id,
			),
		)

	const isWithdrawnInvitation = ({ instanceId }: Invitation) =>
		current().statuses[instanceId]?.state === "withdrawn"

	const sweepWithdrawn = () => {
		const withdrawn = current().invitations.filter(isWithdrawnInvitation)
		if (withdrawn.length === 0) {
			return
		}
		swept = [...swept, ...withdrawn]
		show(
			current().invitations.filter(
				(invitation) => !isWithdrawnInvitation(invitation),
			),
		)
	}

	const invitationOf = (id: string) =>
		current().invitations.find((invitation) => invitation.instanceId === id)

	const refuse = (id: string, reason: unknown) => {
		if (isWithdrawn(reason)) {
			mark(id, { state: "withdrawn" })
			return
		}
		reportRefusal(reason)
		mark(id, null)
	}

	const refuseAccept = (id: string, reason: unknown) => {
		const failure = acceptFailureOf(reason)
		if (failure) {
			mark(id, { state: "failed", failure })
			return
		}
		refuse(id, reason)
	}

	const accept = async (id: string) => {
		const invitation = invitationOf(id)
		if (!invitation || isAccepting(id)) {
			return
		}
		const welcome = async (joined: JoinedSpace) => {
			drop(id)
			await joinedSpaces.admit(joined, invitation.inviterEmail)
		}
		mark(id, { state: "accepting" })
		await transport
			.accept(id)
			.then(welcome, (reason: unknown) => refuseAccept(id, reason))
	}

	const decline = (id: string) =>
		transport.decline(id).then(
			() => drop(id),
			(reason: unknown) => refuse(id, reason),
		)

	return {
		getState: current,
		subscribe: stateStore.subscribe,
		watch,
		accept,
		decline,
		sweepWithdrawn,
	}
}
