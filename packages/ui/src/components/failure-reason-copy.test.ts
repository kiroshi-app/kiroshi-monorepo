import { describe, expect, it } from "vitest"

import type { SpaceWaitReason } from "@workspace/ui/components/space-access-banner"
import type { InviteUnreachableReason } from "@workspace/ui/components/space-settings-dialog/members-panel"
import { i18n } from "@workspace/ui/lib/i18n"

const INVITE_REASONS = Object.keys({
	offline: true,
	timedOut: true,
	unsent: true,
	relayStatus: true,
	relayConflict: true,
	unreadableConflict: true,
	unreadableList: true,
	listNotReadBack: true,
} satisfies Record<InviteUnreachableReason, true>)

const WAIT_REASONS = Object.keys({
	relayUnreachable: true,
	rekeySendFailed: true,
	hostSilent: true,
	socketClosed: true,
	rekeyNotVerified: true,
	notMember: true,
	unknownInstance: true,
	deviceKeysUnreadable: true,
	deviceAwaitingApproval: true,
	socketUrlFailed: true,
	rosterMissing: true,
	keychainReadFailed: true,
} satisfies Record<SpaceWaitReason, true>)

type ReasonGroup = {
	name: string
	reasons: string[]
	keyOf: (reason: string) => string
	fallback: string
}

const GROUPS: ReasonGroup[] = [
	{
		name: "invite failure",
		reasons: INVITE_REASONS,
		keyOf: (reason) => `settings:space.members.failure.invite.${reason}`,
		fallback: "settings:space.members.failure.invite.unreachable",
	},
	{
		name: "waiting for host notice",
		reasons: WAIT_REASONS,
		keyOf: (reason) =>
			`chat:screen.notice.joinRefused.waitingForHost.reasons.${reason}`,
		fallback: "chat:screen.notice.joinRefused.waitingForHost.description",
	},
	{
		name: "offline banner",
		reasons: WAIT_REASONS,
		keyOf: (reason) => `chat:spaceAccessBanner.offline.reasons.${reason}`,
		fallback: "chat:spaceAccessBanner.offline.body",
	},
]

const raw = (key: string, lng: string) =>
	i18n.getFixedT(lng)(key as never) as string

describe.each(GROUPS)("the $name copy", ({ reasons, keyOf, fallback }) => {
	it.each(["en", "fr"])(
		"gives every reason its own key, other than the fallback, in %s",
		(lng) => {
			for (const reason of reasons) {
				expect(i18n.exists(keyOf(reason), { lng })).toBe(true)
				expect(keyOf(reason)).not.toBe(fallback)
				expect(raw(keyOf(reason), lng)).not.toBe(raw(fallback, lng))
			}
		},
	)

	it("words every reason distinctly", () => {
		const sentences = reasons.map((reason) => raw(keyOf(reason), "en"))
		expect(new Set(sentences).size).toBe(reasons.length)
	})
})

describe("the invitation that landed", () => {
	it("says it was sent, never that the invite failed", () => {
		const sentence = i18n.t(
			"settings:space.members.failure.invite.listNotReadBack",
			{
				email: "sam@example.com",
			},
		)
		expect(sentence).toContain("The invitation to sam@example.com was sent")
		expect(sentence).toContain("didn’t refresh")
		expect(sentence).not.toMatch(/couldn’t|wasn’t invited/i)
	})
})
