export class HostRefused extends Error {
	constructor(message: string, cause: unknown) {
		super(message, { cause })
	}

	override toString(): string {
		return String(this.cause)
	}
}

export const isHostRefused = (reason: unknown): reason is HostRefused =>
	reason instanceof HostRefused
