export class HostRefused extends Error {
	constructor(message: string, cause: unknown) {
		super(message, { cause })
		this.name = "HostRefused"
	}
}

export const isHostRefused = (reason: unknown): reason is HostRefused =>
	reason instanceof HostRefused
