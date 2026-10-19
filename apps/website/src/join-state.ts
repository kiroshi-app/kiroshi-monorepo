import { type InvitationSpace, RelayError, readInvitationState } from "./relay"
import { isIPhoneVisitor } from "./use-download-target"

const INVITATION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const CLOSED_STATES: ReadonlySet<string> = new Set([
	"used",
	"expired",
	"withdrawn",
])

type JoinState =
	| { kind: "closed" }
	| {
			kind: "iphone" | "computer"
			invitation: string
			space: InvitationSpace | null
	  }

type InvitationReading = { isClosed: boolean; space: InvitationSpace | null }

const CLOSED = { kind: "closed" } as const

const CLOSED_READING: InvitationReading = { isClosed: true, space: null }

const UNREADABLE: InvitationReading = { isClosed: false, space: null }

const readInvitation = async (
	invitation: string,
): Promise<InvitationReading> => {
	try {
		const { state, space } = await readInvitationState(invitation)
		return {
			isClosed: CLOSED_STATES.has(state),
			space: state === "valid" ? space : null,
		}
	} catch (error) {
		if (!(error instanceof RelayError)) throw error
		return error.failure === "unavailable" ? CLOSED_READING : UNREADABLE
	}
}

const singleInvitationOf = (invitations: string[] = []) => {
	const [invitation] = invitations
	return invitations.length === 1 && INVITATION_PATTERN.test(invitation ?? "")
		? invitation
		: undefined
}

const loadJoinState = async (invitations?: string[]): Promise<JoinState> => {
	const invitation = singleInvitationOf(invitations)
	if (!invitation) return CLOSED
	const { isClosed, space } = await readInvitation(invitation)
	if (isClosed) return CLOSED
	return { kind: isIPhoneVisitor() ? "iphone" : "computer", invitation, space }
}

const UNIVERSAL_JOIN_URL = "https://kiroshi.app/join"

const kiroshiLinkOf = (invitation: string) =>
	`kiroshi://join?${new URLSearchParams({ invitation })}`

const universalLinkOf = (invitation: string) =>
	`${UNIVERSAL_JOIN_URL}?${new URLSearchParams({ invitation })}`

export { kiroshiLinkOf, loadJoinState, universalLinkOf }
