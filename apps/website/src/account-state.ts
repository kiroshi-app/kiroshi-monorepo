import { signInAgainOnUnauthorized } from "./authorize-state"
import { type Account, readAccount, readSessions, type Session } from "./relay"

type AccountState = {
	account: Account
	sessions: Session[]
}

const readAccountState = async (): Promise<AccountState> => {
	const [account, sessions] = await Promise.all([readAccount(), readSessions()])
	return { account, sessions }
}

const loadAccountState = (href: string) =>
	signInAgainOnUnauthorized({ href }, readAccountState)

export { loadAccountState }
