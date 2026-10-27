import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"

import type { ThreadFace } from "@/lib/chat/thread-contract"

type FaceAvatarProps = {
	face: ThreadFace
	size: number
}

export const FaceAvatar = ({ face, size }: FaceAvatarProps) => (
	<BotIdentityAvatar
		hue={face.blot}
		image={face.image}
		name={face.name}
		seed={face.id}
		size={size}
	/>
)
