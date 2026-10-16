import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { JoinedSpaceError } from "../bindings"

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

const noticeOf = (key: NoticeKey): NoticeMessage => ({
	title: i18n.t(`chat:screen.notice.${key}.title`),
	description: i18n.t(`chat:screen.notice.${key}.description`),
})

export const joinRefusalNoticeOf = ({
	kind,
}: JoinedSpaceError): NoticeMessage => noticeOf(NOTICE_KEYS[kind])

export const unexpectedJoinNotice = (): NoticeMessage =>
	noticeOf("joinRefused.unexpected")

export const joinRejectionNoticeOf = (reason: unknown): NoticeMessage =>
	isJoinedSpaceError(reason)
		? joinRefusalNoticeOf(reason)
		: unexpectedJoinNotice()
