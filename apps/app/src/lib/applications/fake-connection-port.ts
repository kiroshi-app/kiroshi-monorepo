import type { ApplicationRow, ConnectionPort } from "./connection-port"
import type { ConnectionCommand } from "./use-connections"

import type { EnvOwner } from "../conversations/store-contract"

type ConnectionCall = {
	command: ConnectionCommand
	owner?: EnvOwner
	name?: string
	url?: string
}

type PendingGrant = {
	resolve: () => void
	reject: (reason: unknown) => void
}

export type FakeConnectionPort = ConnectionPort & {
	calls: ConnectionCall[]
	rows: Record<EnvOwner["kind"], ApplicationRow[]>
	refusals: Partial<Record<ConnectionCommand, unknown>>
	grant: () => void
}

const CANCELLED = { kind: "cancelled" }

export const createFakeConnectionPort = (): FakeConnectionPort => {
	let pending: PendingGrant | null = null

	const answer = (call: ConnectionCall) => {
		fake.calls.push(call)
		const refusal = fake.refusals[call.command]
		if (refusal !== undefined) {
			throw refusal
		}
	}

	const settle = (settleWith: (grant: PendingGrant) => void) => {
		if (pending) {
			settleWith(pending)
		}
		pending = null
	}

	const fake: FakeConnectionPort = {
		calls: [],
		rows: { user: [], bot: [], space: [] },
		refusals: {},

		status: async (owner) => {
			answer({ command: "status", owner })
			return fake.rows[owner.kind]
		},

		connect: async (owner, name, url) => {
			answer({ command: "connect", owner, name, url })
			await new Promise<void>((resolve, reject) => {
				pending = { resolve, reject }
			})
		},

		cancel: async () => {
			answer({ command: "cancel" })
			settle((grant) => grant.reject(CANCELLED))
		},

		disconnect: async (owner, name, url) => {
			answer({ command: "disconnect", owner, name, url })
			return { revoked: true }
		},

		grant: () => settle((grant) => grant.resolve()),
	}

	return fake
}
