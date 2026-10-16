import type { SubmittedAttachment } from "./attachments-contract"
import type { ChatDriver } from "./driver"
import { storedAttachmentPath } from "./message-attachments"

type StatelessMethods = Pick<
	ChatDriver,
	"check" | "namingFor" | "storeAttachments" | "pendingQuestions"
>

const TITLE_LIMIT = 60

export const FAKE_STATELESS_METHODS: StatelessMethods = {
	check: () =>
		Promise.resolve({
			connection: "ready",
			binaryVersion: "fake-0.0.1",
			authenticated: true,
			error: null,
		}),

	namingFor: (text: string) => {
		const title = text.trim().split("\n")[0]?.slice(0, TITLE_LIMIT)
		return Promise.resolve(title ? { title, icon: null } : null)
	},

	storeAttachments: (
		conversationId: string,
		attachments: SubmittedAttachment[],
	) =>
		Promise.resolve(
			attachments.map((attachment) =>
				storedAttachmentPath({
					root: "/tmp/kiroshi",
					conversationId,
					submittedName: attachment.name,
				}),
			),
		),

	pendingQuestions: () => Promise.resolve([]),
}
