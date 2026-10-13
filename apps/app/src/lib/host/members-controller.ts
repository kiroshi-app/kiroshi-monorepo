import {
	type NoticeMessage,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import type {
	InviteRefusal,
	MembersFailure,
	SpaceMember,
} from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

import type { HostedSpace } from "./hosting-controller"
import { invoke, listen } from "./index"

import {
	HOSTING_MEMBERS_CHANGED_EVENT,
	type Member,
	type MembersChanged,
	type MembersError,
} from "../bindings"
import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"

type MembersAnswer<Data> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: MembersError }

export type MembersTransport = {
	list: (spaceId: string) => Promise<MembersAnswer<Member[]>>
	invite: (spaceId: string, email: string) => Promise<MembersAnswer<Member>>
	withdraw: (
		spaceId: string,
		userId: string,
	) => Promise<MembersAnswer<Member[]>>
	remove: (spaceId: string, userId: string) => Promise<MembersAnswer<Member[]>>
	onChanged: (
		listener: (changed: MembersChanged) => void,
	) => Promise<() => void>
}

type MembersControllerState = {
	members: Member[]
	email: string
	refusal: InviteRefusal | undefined
	failure: MembersFailure | undefined
	removing: Member | null
}

type MembersController = {
	getState: () => MembersControllerState
	subscribe: (listener: () => void) => () => void
	watch: (space: HostedSpace) => () => void
	setEmail: (email: string) => void
	invite: (email: string) => void
	withdraw: (userId: string) => void
	askRemove: (userId: string) => void
	confirmRemove: () => void
	cancelRemove: () => void
}

type MembersControllerOptions = {
	transport?: MembersTransport
	reportFailure?: (message: NoticeMessage) => void
	reportSuccess?: (message: NoticeMessage) => void
}

const answerOf = <Data>(call: Promise<Data>): Promise<MembersAnswer<Data>> =>
	call.then(
		(data) => ({ status: "ok", data }),
		(error: unknown) => {
			if (error instanceof Error) throw error
			return { status: "error", error: error as MembersError }
		},
	)

export const membersTransport: MembersTransport = {
	list: (spaceId) => answerOf(invoke<Member[]>("hosting_members", { spaceId })),
	invite: (spaceId, email) =>
		answerOf(invoke<Member>("hosting_invite_member", { spaceId, email })),
	withdraw: (spaceId, userId) =>
		answerOf(
			invoke<Member[]>("hosting_withdraw_invitation", { spaceId, userId }),
		),
	remove: (spaceId, userId) =>
		answerOf(invoke<Member[]>("hosting_remove_member", { spaceId, userId })),
	onChanged: (listener) =>
		listen<MembersChanged>(HOSTING_MEMBERS_CHANGED_EVENT, (event) =>
			listener(event.payload),
		),
}

const INVITE_REFUSALS: Partial<Record<MembersError["kind"], InviteRefusal>> = {
	alreadyInvited: "invited",
	ownAccount: "self",
	notAnEmail: "malformed",
}

type FailureReasons<Action extends MembersFailure["action"]> = Partial<
	Record<
		MembersError["kind"],
		Extract<MembersFailure, { action: Action }>["reason"]
	>
>

const SHARED_REASONS = {
	notHosting: "notHosting",
	notOwner: "notOwner",
	needsSignIn: "needsSignIn",
	unreachable: "unreachable",
} as const

const INVITE_REASONS: FailureReasons<"invite"> = {
	...SHARED_REASONS,
	limitReached: "limitReached",
}

const WITHDRAW_REASONS: FailureReasons<"withdraw"> = {
	...SHARED_REASONS,
	unknownMember: "gone",
	notPending: "joined",
}

const REMOVE_REASONS: FailureReasons<"remove"> = {
	...SHARED_REASONS,
	unknownMember: "gone",
	notJoined: "pending",
	hostNotRemovable: "host",
}

const reasonOf = <Reason extends string>(
	reasons: Partial<Record<MembersError["kind"], Reason>>,
	error: MembersError | undefined,
): Reason | "generic" => (error && reasons[error.kind]) ?? "generic"

const EMPTY_STATE: MembersControllerState = {
	members: [],
	email: "",
	refusal: undefined,
	failure: undefined,
	removing: null,
}

export const toSpaceMember = (member: Member): SpaceMember => ({
	id: member.userId,
	name: member.name ?? undefined,
	email: member.email,
	status: member.status,
})

const nothingChanged = () => i18n.t("settings:space.transfer.reason.generic")

const readFailure = (): NoticeMessage => ({
	title: i18n.t("settings:rail.members"),
	description: nothingChanged(),
})

const withdrawnNotice = (member: Member): NoticeMessage => ({
	title: i18n.t("settings:space.members.withdrawn", { email: member.email }),
})

const withMember = (members: Member[], member: Member) => [
	...members.filter((held) => held.userId !== member.userId),
	member,
]

type Session = {
	space: HostedSpace
}

export const createMembersController = ({
	transport = membersTransport,
	reportFailure = failureReporterIn("members-controller"),
	reportSuccess = raiseTransientNotice,
}: MembersControllerOptions = {}): MembersController => {
	const stateStore = createStore<MembersControllerState>(EMPTY_STATE)
	let current: Session | null = null
	let lastWatchedId: string | null = null

	const patch = (next: Partial<MembersControllerState>) =>
		stateStore.setState({ ...stateStore.getState(), ...next })

	const memberOf = (userId: string) =>
		stateStore.getState().members.find((member) => member.userId === userId)

	const run = <Data>(
		call: (spaceId: string) => Promise<MembersAnswer<Data>>,
		settle: (data: Data) => void,
		fail: (error?: MembersError) => void,
	) => {
		const session = current
		if (!session) return
		void call(session.space.id).then(
			(answer) => {
				if (current !== session) return
				if (answer.status === "ok") {
					settle(answer.data)
				} else {
					fail(answer.error)
				}
			},
			() => {
				if (current === session) fail()
			},
		)
	}

	const watch = (space: HostedSpace) => {
		const session: Session = { space }
		current = session
		if (lastWatchedId !== space.id) {
			stateStore.setState(EMPTY_STATE)
		}
		lastWatchedId = space.id
		run(
			transport.list,
			(members) => patch({ members }),
			() => reportFailure(readFailure()),
		)
		const detach = transport
			.onChanged((changed) => {
				if (current === session && changed.spaceId === space.id) {
					patch({ members: changed.members })
				}
			})
			.catch(() => reportFailure(readFailure()))
		return () => {
			if (current === session) current = null
			void detach.then((unlisten) => unlisten?.())
		}
	}

	const failInvite = (email: string, error?: MembersError) => {
		const refusal = error && INVITE_REFUSALS[error.kind]
		patch(
			refusal
				? { refusal }
				: {
						failure: {
							action: "invite",
							reason: reasonOf(INVITE_REASONS, error),
							email,
						},
					},
		)
	}

	const invite = (email: string) => {
		patch({ refusal: undefined, failure: undefined })
		run(
			(spaceId) => transport.invite(spaceId, email),
			(member) =>
				patch({
					members: withMember(stateStore.getState().members, member),
					email: "",
					refusal: undefined,
				}),
			(error) => failInvite(email, error),
		)
	}

	const withdraw = (userId: string) => {
		const member = memberOf(userId)
		if (!member) return
		patch({ failure: undefined })
		run(
			(spaceId) => transport.withdraw(spaceId, userId),
			(members) => {
				patch({ members })
				reportSuccess(withdrawnNotice(member))
			},
			(error) =>
				patch({
					failure: {
						action: "withdraw",
						reason: reasonOf(WITHDRAW_REASONS, error),
						member: toSpaceMember(member),
					},
				}),
		)
	}

	const askRemove = (userId: string) => {
		const member = memberOf(userId)
		if (member) patch({ removing: member })
	}

	const confirmRemove = () => {
		const member = stateStore.getState().removing
		if (!member) return
		patch({ removing: null, failure: undefined })
		run(
			(spaceId) => transport.remove(spaceId, member.userId),
			(members) => patch({ members }),
			(error) =>
				patch({
					failure: {
						action: "remove",
						reason: reasonOf(REMOVE_REASONS, error),
						member: toSpaceMember(member),
					},
				}),
		)
	}

	return {
		getState: stateStore.getState,
		subscribe: stateStore.subscribe,
		watch,
		setEmail: (email) => patch({ email, refusal: undefined }),
		invite,
		withdraw,
		askRemove,
		confirmRemove,
		cancelRemove: () => patch({ removing: null }),
	}
}
