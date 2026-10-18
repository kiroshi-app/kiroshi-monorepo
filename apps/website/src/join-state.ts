import { RelayError, readInvitationStatus } from "./relay"
import { isIPhoneVisitor } from "./use-download-target"

const INVITATION_PATTERN = /^[\w-]{1,200}$/

const CLOSED_STATUSES: ReadonlySet<string> = new Set([
	"used",
	"expired",
	"withdrawn",
])

type JoinSearch = { invitation?: string }

type JoinState =
	| { kind: "closed" }
	| { kind: "iphone" | "computer"; invitation: string }

const CLOSED = { kind: "closed" } as const

const validateJoinSearch = (search: Record<string, unknown>): JoinSearch => ({
	invitation:
		typeof search.invitation === "string" &&
		INVITATION_PATTERN.test(search.invitation)
			? search.invitation
			: undefined,
})

const isClosedInvitation = async (invitation: string) => {
	try {
		return CLOSED_STATUSES.has(await readInvitationStatus(invitation))
	} catch (error) {
		if (error instanceof RelayError) return false
		throw error
	}
}

const loadJoinState = async (invitation?: string): Promise<JoinState> => {
	if (!invitation || (await isClosedInvitation(invitation))) return CLOSED
	return { kind: isIPhoneVisitor() ? "iphone" : "computer", invitation }
}

const UNIVERSAL_JOIN_URL = "https://kiroshi.app/join"

const kiroshiLinkOf = (invitation: string) =>
	`kiroshi://join?${new URLSearchParams({ invitation })}`

const universalLinkOf = (invitation: string) =>
	`${UNIVERSAL_JOIN_URL}?${new URLSearchParams({ invitation })}`

export { kiroshiLinkOf, loadJoinState, universalLinkOf, validateJoinSearch }
