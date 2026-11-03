import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { JoinedSpaceError, JoinedSpaceWaitReason } from "../bindings"

const NOTICE_KEYS = {
	hostOffline: "hostOffline",
	unavailable: "joinRefused.unavailable",
	storage: "joinRefused.storage",
	unknownJoinedSpace: "joinRefused.unknownJoinedSpace",
	undeliverable: "joinRefused.undeliverable",
	proxyUnavailable: "joinRefused.proxyUnavailable",
	ownerNotRemovable: "joinRefused.ownerNotRemovable",
	needsSignIn: "joinRefused.needsSignIn",
	sessionRevoked: "joinRefused.sessionRevoked",
	sessionStore: "joinRefused.sessionStore",
	relayUnreachable: "joinRefused.relayUnreachable",
	relayRefused: "joinRefused.relayRefused",
	invitationExpired: "joinRefused.invitationExpired",
	invitationWithdrawn: "joinRefused.invitationWithdrawn",
	invitationUsed: "joinRefused.invitationUsed",
	invitationOtherEmail: "joinRefused.invitationOtherEmail",
	couldNotAccept: "joinRefused.couldNotAccept",
	noInvitation: "joinRefused.noInvitation",
	notInRoster: "joinRefused.notInRoster",
	badSignature: "joinRefused.badSignature",
	removedByRotation: "joinRefused.removedByRotation",
	waitingForHost: "joinRefused.waitingForHost",
	keyStore: "joinRefused.keyStore",
	spaceRefused: "joinRefused.unexpected",
} as const satisfies Record<JoinedSpaceError["kind"], string>

export const isJoinedSpaceError = (
	reason: unknown,
): reason is JoinedSpaceError =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	typeof reason.kind === "string" &&
	Object.hasOwn(NOTICE_KEYS, reason.kind)

type NoticeKey =
	| (typeof NOTICE_KEYS)[JoinedSpaceError["kind"]]
	| "joinRefused.unexpected"

export type JoinedSpaceNaming = { space?: string; host?: string }

const NO_NAMING: JoinedSpaceNaming = {}

const variablesOf = (naming: JoinedSpaceNaming) =>
	naming as Required<JoinedSpaceNaming>

const noticeOf = (
	key: NoticeKey,
	naming: JoinedSpaceNaming = NO_NAMING,
): NoticeMessage => ({
	title: i18n.t(`chat:screen.notice.${key}.title`, variablesOf(naming)),
	description: i18n.t(
		`chat:screen.notice.${key}.description`,
		variablesOf(naming),
	),
})

const waitingForHostNoticeOf = (
	reason: JoinedSpaceWaitReason | undefined,
	naming: JoinedSpaceNaming,
): NoticeMessage => {
	const notice = noticeOf(NOTICE_KEYS.waitingForHost, naming)
	if (!reason) return notice
	return {
		...notice,
		description: i18n.t(
			`chat:screen.notice.joinRefused.waitingForHost.reasons.${reason}`,
			variablesOf(naming),
		),
	}
}

export const joinRefusalNoticeOf = (
	error: JoinedSpaceError,
	naming: JoinedSpaceNaming = NO_NAMING,
): NoticeMessage =>
	error.kind === "waitingForHost"
		? waitingForHostNoticeOf(error.reason, naming)
		: noticeOf(NOTICE_KEYS[error.kind], naming)

export const unexpectedJoinNotice = (
	naming: JoinedSpaceNaming = NO_NAMING,
): NoticeMessage => noticeOf("joinRefused.unexpected", naming)

export const joinRejectionNoticeOf = (
	reason: unknown,
	naming: JoinedSpaceNaming = NO_NAMING,
): NoticeMessage =>
	isJoinedSpaceError(reason)
		? joinRefusalNoticeOf(reason, naming)
		: unexpectedJoinNotice(naming)
