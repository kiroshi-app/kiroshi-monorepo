import { expect } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	AgentAnswerFrame,
	expectAnswerInsideFrame,
} from "@workspace/storybook/story-utils"
import { CASA_DO_RIO_TERRACE } from "@workspace/ui/components/answer-blocks/answer-blocks.fixtures"
import { VideoPlayer } from "@workspace/ui/components/answer-blocks/video-player"

const meta = preview.meta({
	title: "Conversation/Markdown/VideoPlayer",
	component: VideoPlayer,
	parameters: {
		layout: "padded",
		docs: {
			description: {
				component:
					"A video the agent points at, played in place. The round button plays and pauses, the Space coloured marker on the track seeks to the moment the answer names. Reach for it when the answer is about one moment of one video; nothing loads before the reader presses play.",
			},
		},
	},
	args: {
		src: "https://media.casadorio.pt/casa-do-rio-tour.mp4",
		title: "casa-do-rio-tour.mp4",
		duration: 272,
		source: "casadorio.pt",
		poster: CASA_DO_RIO_TERRACE,
		marker: { time: 136, label: "Terrace" },
	},
	render: (args) => (
		<AgentAnswerFrame intro="The tour they sent, the terrace comes at 2:16.">
			<VideoPlayer {...args} />
		</AgentAnswerFrame>
	),
})

const stubPlayback = (root: HTMLElement, playback: () => Promise<void>) => {
	const video = root.querySelector("video")
	if (!video) throw new Error("The player draws no video")
	video.play = () =>
		playback().then(() => {
			video.dispatchEvent(new Event("play"))
		})
	video.pause = () => {
		video.dispatchEvent(new Event("pause"))
	}
}

export const PausedWithMarker = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard Markdown 13. Check the player is 358 high, the marker sits at the middle of the track, and pressing it moves the current time to 2:16.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const player = canvasElement.querySelector("video")?.parentElement
		await expect(player?.getBoundingClientRect().height).toBe(358)

		const marker = canvas.getByRole("button", { name: "Go to 2:16" })
		const track = marker.parentElement
		if (!track) throw new Error("The marker sits on no track")
		const markerBox = marker.getBoundingClientRect()
		const trackBox = track.getBoundingClientRect()
		await expect(markerBox.left + markerBox.width / 2).toBeCloseTo(
			trackBox.left + trackBox.width / 2,
		)

		await userEvent.click(marker)
		await expect(canvas.getByText("2:16")).toBeInTheDocument()
	},
})

export const WithoutPosterOrMarker = meta.story({
	globals: { theme: "dark" },
	args: { poster: undefined, marker: undefined, source: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"No poster and no marker: the slate to rust gradient fills the player, the track is bare, the caption is the title alone.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const player = canvasElement.querySelector("video")?.parentElement
		if (!player) throw new Error("The player draws no surface")
		await expect(getComputedStyle(player).backgroundImage).toBe(
			"linear-gradient(170deg in oklab, rgb(92, 124, 140) 0%, rgb(52, 80, 95) 45%, rgb(142, 107, 76) 100%)",
		)
		await expect(canvas.queryByRole("button", { name: /^Go to/ })).toBeNull()
		await expect(canvas.getByText("casa-do-rio-tour.mp4")).toBeInTheDocument()
	},
})

export const PlaysAndPauses = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"Check the round button plays on a click, pauses on Enter, plays again on Space, and names the video with the action it does next.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		stubPlayback(canvasElement, () => Promise.resolve())

		await userEvent.click(
			canvas.getByRole("button", { name: "Play casa-do-rio-tour.mp4" }),
		)
		const pause = await canvas.findByRole("button", {
			name: "Pause casa-do-rio-tour.mp4",
		})

		await userEvent.keyboard("{Enter}")
		await expect(pause).toHaveAccessibleName("Play casa-do-rio-tour.mp4")

		await userEvent.keyboard(" ")
		await expect(
			await canvas.findByRole("button", { name: "Pause casa-do-rio-tour.mp4" }),
		).toHaveFocus()
	},
})

export const PlayFailed = meta.story({
	globals: { theme: "dark" },
	parameters: {
		docs: {
			description: {
				story:
					"The video does not play. Check the player stays paused and says so under the caption, without moving focus.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		stubPlayback(canvasElement, () =>
			Promise.reject(new Error("NotSupportedError")),
		)

		const play = canvas.getByRole("button", {
			name: "Play casa-do-rio-tour.mp4",
		})
		await userEvent.click(play)
		await expect(await canvas.findByRole("status")).toHaveTextContent(
			"Couldn’t play the video. Press play to try again.",
		)
		await expect(play).toHaveAccessibleName("Play casa-do-rio-tour.mp4")
	},
})

export const InNarrowColumn = meta.story({
	args: {
		title:
			"casa-do-rio-guesthouse-full-walkthrough-terrace-rooms-breakfast.mp4",
		marker: { time: 136, label: "Terrace overlooking the river at sunset" },
	},
	render: (args) => (
		<AgentAnswerFrame intro="The tour they sent." width={320}>
			<VideoPlayer {...args} />
		</AgentAnswerFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A 320 wide column and a long file name. Check the player shrinks to the column, the caption truncates, and nothing scrolls sideways.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAnswerInsideFrame(canvasElement)
	},
})
