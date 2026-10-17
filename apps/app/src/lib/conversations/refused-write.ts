import { describeFailure } from "../failure-report"

export class RefusedWrite extends Error {
	readonly command: string
	readonly turn: string | undefined

	constructor(command: string, turn: string | undefined, cause: unknown) {
		super(describeFailure(cause), { cause })
		this.command = command
		this.turn = turn
	}
}

export const isRefusedWrite = (reason: unknown): reason is RefusedWrite =>
	reason instanceof RefusedWrite
