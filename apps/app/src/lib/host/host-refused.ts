export type HostRefusalKind = "hostOnly" | "unknownCommand" | "other"

export type RefusedCall = {
	command?: string
	status?: number
}

export class HostRefused extends Error {
	readonly refusalKind: HostRefusalKind
	readonly command?: string
	readonly status?: number

	constructor(
		message: string,
		cause: unknown,
		refusalKind: HostRefusalKind = "other",
		{ command, status }: RefusedCall = {},
	) {
		super(message, { cause })
		this.refusalKind = refusalKind
		this.command = command
		this.status = status
	}

	override toString(): string {
		return String(this.cause)
	}
}

export const isHostRefused = (reason: unknown): reason is HostRefused =>
	reason instanceof HostRefused

export const isUnknownCommandRefusal = (reason: unknown): boolean =>
	isHostRefused(reason) && reason.refusalKind === "unknownCommand"
