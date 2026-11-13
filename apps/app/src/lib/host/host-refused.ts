export type HostRefusalKind = "hostOnly" | "unknownCommand" | "other"

export class HostRefused extends Error {
	readonly refusalKind: HostRefusalKind

	constructor(
		message: string,
		cause: unknown,
		refusalKind: HostRefusalKind = "other",
	) {
		super(message, { cause })
		this.refusalKind = refusalKind
	}

	override toString(): string {
		return String(this.cause)
	}
}

export const isHostRefused = (reason: unknown): reason is HostRefused =>
	reason instanceof HostRefused

export const isUnknownCommandRefusal = (reason: unknown): boolean =>
	isHostRefused(reason) && reason.refusalKind === "unknownCommand"
