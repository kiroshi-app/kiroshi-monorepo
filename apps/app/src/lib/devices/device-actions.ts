import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { AccountDevice, DeviceError } from "../bindings"

type Answer<Data, Refusal> =
	| { status: "ok"; data: Data }
	| { status: "error"; error: Refusal }

export class DeviceNotRemoved extends Error {
	readonly device: AccountDevice

	constructor(device: AccountDevice, refusal: DeviceError) {
		super(refusal.kind, { cause: refusal })
		this.device = device
	}
}

export const answerOf = async <Data, Refusal>(
	answering: Promise<Answer<Data, Refusal>>,
): Promise<Data> => {
	const answer = await answering
	if (answer.status === "error") throw answer.error
	return answer.data
}

const isUnreachable = (refusal: unknown) =>
	typeof refusal === "object" &&
	refusal !== null &&
	"kind" in refusal &&
	refusal.kind === "unreachable"

export const deviceFailureNotice = (refusal: unknown): NoticeMessage =>
	isUnreachable(refusal)
		? { title: i18n.t("settings:account.unreachable.title") }
		: // TODO: the catalogue has no device copy for codeInvalid, tooManyRequests nor the other DeviceError kinds.
			{ title: i18n.t("chat:screen.notice.failed") }
