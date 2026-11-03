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

const WAITING = "chat:screen.notice.joinRefused.waitingForHost"
const UNEXPECTED = "chat:screen.notice.joinRefused.unexpected"
const BANNER = "chat:spaceAccessBanner.offline"
const NAMING = { host: "Noa", space: "Studio" }
const CHECK_YOUR_CONNECTION = /check your connection|vérifiez votre connexion/i
const LANGUAGES = ["en", "fr"]

const waitLineKeys = (reasons: string[]) =>
	reasons.flatMap((reason) => [
		`${WAITING}.reasons.${reason}`,
		`${BANNER}.reasons.${reason}`,
	])

const named = (key: string, lng: string) =>
	i18n.getFixedT(lng)(key as never, NAMING) as string

describe.each(LANGUAGES)("the joined space wait copy in %s", (lng) => {
	it("asks to check the connection only when Kiroshi is unreachable", () => {
		for (const key of waitLineKeys(["relayUnreachable"])) {
			expect(raw(key, lng)).toMatch(CHECK_YOUR_CONNECTION)
		}
		const others = WAIT_REASONS.filter(
			(reason) => reason !== "relayUnreachable",
		)
		for (const key of waitLineKeys(others)) {
			expect(raw(key, lng)).not.toMatch(CHECK_YOUR_CONNECTION)
		}
	})

	it("names the host in the waiting notice title and in every banner line", () => {
		expect(named(`${WAITING}.title`, lng)).toContain("Noa")
		for (const reason of WAIT_REASONS) {
			expect(named(`${BANNER}.reasons.${reason}`, lng)).toContain("Noa")
		}
	})

	it("names the space when something unexpected went wrong", () => {
		expect(named(`${UNEXPECTED}.title`, lng)).toContain("Studio")
	})

	it("leaves no placeholder when the host and the space are not passed", () => {
		const keys = [
			`${WAITING}.title`,
			`${WAITING}.description`,
			`${UNEXPECTED}.title`,
			`${UNEXPECTED}.description`,
			...waitLineKeys(WAIT_REASONS),
		]
		for (const key of keys) {
			expect(i18n.getFixedT(lng)(key as never) as string).not.toMatch(/\{\{/)
		}
	})

	it("never calls the host's computer a Mac", () => {
		for (const key of waitLineKeys(WAIT_REASONS)) {
			expect(raw(key, lng)).not.toMatch(/\bMac\b/)
		}
	})
})

describe("the host who hasn't answered", () => {
	it.each(["socketClosed", "rekeySendFailed"])(
		"says so on %s and asks for Kiroshi on their computer",
		(reason) => {
			for (const key of waitLineKeys([reason])) {
				const line = named(key, "en")
				expect(line).toContain("Noa hasn’t answered")
				expect(line).toMatch(/ask them to open Kiroshi on their computer/i)
			}
		},
	)
})

describe("the unnamed host and space", () => {
	it.each([
		["en", "Waiting for the host", "Something went wrong with this space"],
		["fr", "En attente de l’hôte", "Un problème est survenu avec cet espace"],
	])("read as words in %s", (lng, waiting, unexpected) => {
		expect(i18n.getFixedT(lng)(`${WAITING}.title` as never)).toBe(waiting)
		expect(i18n.getFixedT(lng)(`${UNEXPECTED}.title` as never)).toBe(unexpected)
	})
})
