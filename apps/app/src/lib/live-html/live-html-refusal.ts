import type { LiveHtmlError } from "@/lib/bindings"

type RefusalClass = "expected" | "unexpected"

const REFUSAL_CLASSES: Record<LiveHtmlError["kind"], RefusalClass> = {
	notAvailableHere: "expected",
	outsideAttachments: "expected",
	notHtml: "expected",
	unreadable: "expected",
	unknownView: "unexpected",
	alreadyShown: "unexpected",
	invalidRectangle: "unexpected",
	invalidRadius: "unexpected",
	mainWindowMissing: "unexpected",
	unserved: "unexpected",
	unplaced: "unexpected",
}

const isLiveHtmlError = (reason: unknown): reason is LiveHtmlError =>
	typeof reason === "object" &&
	reason !== null &&
	"kind" in reason &&
	typeof reason.kind === "string" &&
	Object.hasOwn(REFUSAL_CLASSES, reason.kind)

export const isExpectedRefusal = (reason: unknown): reason is LiveHtmlError =>
	isLiveHtmlError(reason) && REFUSAL_CLASSES[reason.kind] === "expected"
