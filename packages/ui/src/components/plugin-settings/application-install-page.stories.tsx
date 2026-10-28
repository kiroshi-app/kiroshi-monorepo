import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
	probedStyleOf,
} from "@workspace/storybook/story-utils"
import {
	ApplicationInstallPage,
	type ApplicationInstallPageProps,
} from "@workspace/ui/components/plugin-settings/application-install-page"
import {
	API_KEY_INSTALL,
	EMPTY_TOOL_LIST_INSTALL,
	HOSTED_INSTALL,
	HOSTED_NOTHING_INSTALL,
	LOCAL_PACKAGE_INSTALL,
	LONG_INSTALL,
	MIXED_FIELDS_INSTALL,
	REFUSED_INSTALL,
	REGISTRY_INSTALL,
	SIGN_IN_INSTALL,
} from "@workspace/ui/components/plugin-settings/applications.fixtures"
import { EVERYTHING_CATEGORY } from "@workspace/ui/components/plugin-settings/applications-catalogue"
import type { ApplicationsOwner } from "@workspace/ui/components/plugin-settings/applications-panel"

const INSTALL_FAILURE = "Sentry refused the key: 401 invalid token."

const COMPANION: ApplicationsOwner = { kind: "companion", name: "Rei" }

const SPACE: ApplicationsOwner = { kind: "space", name: "Atlas" }

type InstallOutcome = "refused" | "added"

const pendingInstall: { settle?: (outcome: InstallOutcome) => void } = {}

const InstallFlowHost = (props: ApplicationInstallPageProps) => {
	const [isInstalling, setInstalling] = useState(false)
	const [isInstalled, setInstalled] = useState(false)
	const [failure, setFailure] = useState<string>()

	return (
		<ApplicationInstallPage
			{...props}
			failure={failure}
			isInstalled={isInstalled}
			isInstalling={isInstalling}
			onInstall={(values) => {
				props.onInstall(values)
				setFailure(undefined)
				setInstalling(true)
				pendingInstall.settle = (outcome) => {
					setInstalling(false)
					if (outcome === "added") setInstalled(true)
					else setFailure(INSTALL_FAILURE)
				}
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Settings/Plugins/ApplicationInstallPage",
	component: ApplicationInstallPage,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The page a catalogue card pushes. The catalogue rail stays, the column beside it names the application and offers one action, then says what adding it takes: a sign-in, a key, or nothing. The tools it brings are listed one by one, and the footnote speaks for whoever the page was pushed from.",
			},
		},
	},
	decorators: [
		(Story) => (
			<div className="flex h-[34rem] w-[52rem] overflow-hidden rounded-2xl border border-border">
				<Story />
			</div>
		),
	],
	args: {
		application: SIGN_IN_INSTALL,
		owner: COMPANION,
		category: EVERYTHING_CATEGORY,
		onCategoryChange: fn(),
		onBack: fn(),
		onInstall: fn(),
	},
})

export const SignsYouIn = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"E5. An application that signs you in, on this machine. Check the attention notice with its dot, the external-link glyph before Add and sign in, every tool as a pill, the footnote naming the companion, and that nothing states where it runs: no fact line, no hosted fine print.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Granola signs you in")).toBeVisible()
		await expect(
			canvasElement.querySelector('[data-slot="application-fact"]'),
		).toBeNull()
		await expect(
			canvasElement.querySelector('[data-slot="application-meta"]'),
		).toBeNull()
		await expect(
			canvas.queryByText(/not on this machine/),
		).not.toBeInTheDocument()
		await expect(
			canvas.getByText(/Applications run on your machine/),
		).toBeVisible()
		await expect(
			canvas.getByText("Reads your meeting notes and transcripts."),
		).not.toHaveClass("font-mono")
		await expect(canvas.getByText("6 tools")).toBeVisible()
		await expect(canvas.getAllByRole("listitem")).toHaveLength(6)
		await expect(
			canvas.getByText(/Adding one reopens Rei’s session/),
		).toBeVisible()

		const action = canvas.getByRole("button", { name: "Add and sign in" })
		await expect(action.querySelector("svg")).not.toBeNull()
		await expect(getComputedStyle(action).paddingInlineStart).toBe("12px")
		await expect(getComputedStyle(action).paddingInlineEnd).toBe("14px")
		await userEvent.click(action)
		await expect(args.onInstall).toHaveBeenCalledWith({})

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const NeedsApiKey = meta.story({
	args: { application: API_KEY_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"E6. An application that needs one key. Check the muted panel titled for the application, the field labelled as the variable it fills with its description under it, the empty concealed input and its Show control named after that field, the glyphless Add an application, and the keyboard order: field, reveal, action.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(canvas.getByText("What Sentry needs to run")).toBeVisible()
		const field = canvas.getByLabelText("Authorization")
		await expect(field).toHaveAttribute("type", "password")
		await expect(field).not.toHaveAttribute("placeholder")
		await expect(canvas.getByText("A Sentry user auth token.")).toBeVisible()

		await userEvent.click(field)
		await userEvent.keyboard("sntryu_secret")
		await userEvent.tab()
		const reveal = canvas.getByRole("button", { name: "Show Authorization" })
		await expect(reveal).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(field).toHaveAttribute("type", "text")
		await expect(
			canvas.getByRole("button", { name: "Hide Authorization" }),
		).toHaveFocus()

		await userEvent.tab()
		const action = canvas.getByRole("button", { name: "Add an application" })
		await expect(action).toHaveFocus()
		await expect(action.querySelector("svg")).toBeNull()
		await userEvent.keyboard("{Enter}")
		await expect(args.onInstall).toHaveBeenCalledWith({
			Authorization: "sntryu_secret",
		})
	},
})

export const AsksForEveryValue = meta.story({
	args: { application: LOCAL_PACKAGE_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"A package that runs on this machine and asks for every variable it declares as required. Check one labelled input per variable in the order they arrive, each with its own description, that nothing offers to show a value nobody conceals, and that adding hands each typed value under the name of the variable it fills.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const labels = canvas
			.getAllByText(/^GODOT_/)
			.map((held) => held.textContent)
		await expect(labels).toEqual(["GODOT_PATH", "GODOT_PROJECT_PATH"])

		const path = canvas.getByLabelText("GODOT_PATH")
		const project = canvas.getByLabelText("GODOT_PROJECT_PATH")
		await expect(path).toHaveAttribute("type", "text")
		await expect(project).toHaveAttribute("type", "text")
		await expect(
			canvas.queryByRole("button", { name: /^Show / }),
		).not.toBeInTheDocument()

		await userEvent.click(path)
		await userEvent.keyboard("/usr/local/bin/godot")
		await userEvent.tab()
		await expect(project).toHaveFocus()
		await userEvent.keyboard("/home/games/asteroids")

		await userEvent.click(
			canvas.getByRole("button", { name: "Add an application" }),
		)
		await expect(args.onInstall).toHaveBeenCalledWith({
			GODOT_PATH: "/usr/local/bin/godot",
			GODOT_PROJECT_PATH: "/home/games/asteroids",
		})
	},
})

export const ConcealsTheSecretFieldAlone = meta.story({
	args: { application: MIXED_FIELDS_INSTALL },
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A package asking for a plain path beside a secret token. Check that only the token is masked, that its Show control names it and reveals it alone, and that the plain field stays readable throughout.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const path = canvas.getByLabelText("GODOT_PATH")
		const token = canvas.getByLabelText("FUNPLAY_GODOT_MCP_TOKEN")
		await expect(path).toHaveAttribute("type", "text")
		await expect(token).toHaveAttribute("type", "password")
		await expect(
			canvas.getAllByRole("button", { name: /^Show / }),
		).toHaveLength(1)

		await userEvent.click(
			canvas.getByRole("button", { name: "Show FUNPLAY_GODOT_MCP_TOKEN" }),
		)
		await expect(token).toHaveAttribute("type", "text")
		await expect(path).toHaveAttribute("type", "text")
	},
})

export const NothingToSetUp = meta.story({
	args: { application: REGISTRY_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"E7. A registry package that asks for nothing. The registry answers no tool list, so check the plain server mark, the name and the package invocation in monospace, the check line with no panel, nothing at all about tools, and that nothing is said about whether Kiroshi has read it.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(canvas.getByRole("heading", { name: "tasklog" })).toHaveClass(
			"font-mono",
		)
		await expect(canvas.getByText("npx -y @kwn/tasklog-mcp")).toHaveClass(
			"font-mono",
		)
		await expect(
			canvas.getByText(
				"Nothing to set up. It runs on this machine, with no key and no sign-in.",
			),
		).toBeVisible()
		await expect(
			canvas.queryByRole("heading", { name: "What it brings" }),
		).not.toBeInTheDocument()
		await expect(canvas.queryByText(/\d+ tools?$/)).not.toBeInTheDocument()
		await expect(canvas.queryByRole("listitem")).not.toBeInTheDocument()
		await expect(
			canvas.getByText(/Applications run on your machine/),
		).toBeVisible()
		await expect(
			canvas.queryByText("Kiroshi hasn’t read this one"),
		).not.toBeInTheDocument()
		await expect(canvas.queryByText(/^Published on /)).not.toBeInTheDocument()
	},
})

export const EmptyToolList = meta.story({
	args: { application: EMPTY_TOOL_LIST_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"An application whose source read its tools and found none. Check that the heading and the count are there, claiming zero, since nothing brought is a read fact and not an unknown.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByRole("heading", { name: "What it brings" }),
		).toBeVisible()
		await expect(canvas.getByText("0 tools")).toBeVisible()
	},
})

export const Refused = meta.story({
	args: { application: REFUSED_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"An application Kiroshi refuses to add, because the key it asks for would travel in the url of the host running it. Check the destructive notice naming the application and the field it refused, the hosting fact and the fine print speaking for its source rather than this machine, that no install action sits anywhere on the page and no empty bordered cell is left where it sat, and that the way back to the catalogue is still one press away.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(canvas.getByText("Kiroshi can’t add Queried")).toBeVisible()

		const sentence = canvas.getByText(/^It can’t be added from here/)
		await expect(sentence).toHaveTextContent('"apiKey"')
		await expect(sentence).toHaveTextContent(
			"a key must never travel in a url.",
		)

		await expect(
			canvas.queryByRole("button", { name: "Add an application" }),
		).not.toBeInTheDocument()
		await expect(
			canvas.queryByRole("button", { name: "Add and sign in" }),
		).not.toBeInTheDocument()

		const [hosting] = [
			...canvasElement.querySelectorAll('[data-slot="application-fact"]'),
		]
		await expect(hosting).toHaveTextContent(
			"Runs on queried.run.tools, not on this machine.",
		)
		await expect(
			canvas.getByText(
				/This one runs on Smithery’s server, not on your machine\. Adding it reopens Rei’s session/,
			),
		).toBeVisible()

		const grid = canvas.getByRole("tabpanel").parentElement as HTMLElement
		await expect(grid.children).toHaveLength(2)

		await userEvent.click(
			canvas.getByRole("button", { name: "All applications" }),
		)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
})

export const RefusedWithoutReason = meta.story({
	args: { application: { ...REFUSED_INSTALL, refusal: undefined } },
	tags: ["test-only"],
	parameters: {
		docs: {
			description: {
				story:
					"A refusal a descriptor states without saying why, which the backend never answers today. Check that the notice stands on its title alone, with no empty sentence and no empty block above the hosting fact.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Kiroshi can’t add Queried")).toBeVisible()
		await expect(
			canvas.queryByText(/It can’t be added from here/),
		).not.toBeInTheDocument()
		await expect(
			canvasElement.querySelectorAll('[data-slot="application-fact"]'),
		).toHaveLength(1)
	},
})

export const InstallRunning = meta.story({
	args: { application: API_KEY_INSTALL, isInstalling: true },
	parameters: {
		docs: {
			description: {
				story:
					"The install in flight. Check that the action reads as busy and unavailable to assistive technology, stays focusable, calls nothing when pressed, and that the key field and the rest of the page stay usable.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const action = canvas.getByRole("button", { name: "Add an application" })
		await expect(action).toHaveAttribute("aria-busy", "true")
		await expect(action).toHaveAttribute("aria-disabled", "true")
		action.focus()
		await expect(action).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onInstall).not.toHaveBeenCalled()

		const field = canvas.getByLabelText("Authorization")
		await userEvent.type(field, "sntryu_")
		await expect(field).toHaveValue("sntryu_")
	},
})

export const InstallFailedFromKeyboard = meta.story({
	args: { application: API_KEY_INSTALL },
	render: (args) => <InstallFlowHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The action pressed from the keyboard, run, then refused. Check that focus never leaves the action, that a second press while running calls nothing, that the reason lands under the key panel as an alert in the destructive colour, that the action is available again, and that the typed key is still there.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Authorization")
		await userEvent.type(field, "sntryu_wrong")
		await userEvent.tab()
		await userEvent.tab()
		const action = canvas.getByRole("button", { name: "Add an application" })
		await expect(action).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(action).toHaveAttribute("aria-busy", "true")
		await expect(action).toHaveAttribute("aria-disabled", "true")
		await expect(action).toHaveFocus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onInstall).toHaveBeenCalledTimes(1)
		await expect(args.onInstall).toHaveBeenCalledWith({
			Authorization: "sntryu_wrong",
		})

		pendingInstall.settle?.("refused")
		const alert = await canvas.findByRole("alert")
		await expect(alert).toHaveTextContent(INSTALL_FAILURE)
		await expect(alert).toHaveClass("text-destructive")
		await expect(action).toHaveFocus()
		await expect(action).not.toHaveAttribute("aria-disabled", "true")
		await expect(field).toHaveValue("sntryu_wrong")
	},
})

export const InstallAddedFromKeyboard = meta.story({
	render: (args) => <InstallFlowHost {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"The action pressed from the keyboard, run, then added. Check that focus never leaves the action, that it ends on Added with a check glyph, reachable but unavailable to assistive technology, and that pressing it again calls nothing.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const action = canvas.getByRole("button", { name: "Add and sign in" })
		action.focus()
		await userEvent.keyboard("{Enter}")
		await expect(action).toHaveAttribute("aria-busy", "true")
		await expect(action).toHaveFocus()

		pendingInstall.settle?.("added")
		await expect(await canvas.findByRole("button", { name: "Added" })).toBe(
			action,
		)
		await expect(action).toHaveFocus()
		await expect(action).toHaveAttribute("aria-disabled", "true")
		await expect(action).not.toHaveAttribute("aria-busy", "true")
		await expect(action.querySelector("svg")).not.toBeNull()

		await userEvent.keyboard("{Enter}")
		await expect(args.onInstall).toHaveBeenCalledTimes(1)
	},
})

export const ForSpace = meta.story({
	args: {
		application: API_KEY_INSTALL,
		owner: SPACE,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The page pushed from a space. Check that the key sentence and the footnote speak for every companion in the space rather than for one.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.getByText(/Every agent in Atlas sees the tools/),
		).toBeVisible()
		await expect(
			canvas.getByText(/gives every agent in Atlas its tools\./),
		).toBeVisible()
	},
})

export const LongContent = meta.story({
	args: { application: LONG_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"A 60-character name and 40 tools. Check that only the name truncates, keeping its full value as a title, and that every tool keeps its own pill, wrapped over as many rows as it takes.",
			},
		},
	},
	play: async ({ canvas }) => {
		const heading = canvas.getByRole("heading", { name: LONG_INSTALL.name })
		await expect(heading).toHaveAttribute("title", LONG_INSTALL.name)
		await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth)
		await expect(canvas.getAllByRole("listitem")).toHaveLength(40)
		await expect(canvas.getByText("40 tools")).toBeVisible()
	},
})

export const RunsOnItsHost = meta.story({
	args: { application: HOSTED_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"E7b. A registry application its source runs for you. Check the verified pill after the name, the source and the uses under the description, the sign-in read as a plain fact rather than a tinted attention field, the hosting fact in the attention colour with its host in monospace, the plain Add an application, the fine print sending it to its source’s server, and that nothing claims this machine.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(canvas.getByText("Verified")).toBeVisible()
		await expect(canvas.getByText("Smithery")).toBeVisible()
		await expect(canvas.getByText("12,110 uses")).toBeVisible()

		await expect(canvas.queryByText(/^Published on /)).not.toBeInTheDocument()
		await expect(
			canvas.queryByText(/runs on this machine/),
		).not.toBeInTheDocument()

		await expect(
			canvas.queryByText("Slack signs you in"),
		).not.toBeInTheDocument()
		const [signIn, hosting] = [
			...canvasElement.querySelectorAll('[data-slot="application-fact"]'),
		]
		await expect(signIn).toHaveTextContent(
			"Signs you in. Slack opens in your browser and asks to allow Kiroshi.",
		)
		await expect(signIn.querySelector("svg")).toHaveClass(
			"text-muted-foreground",
		)
		await expect(hosting).toHaveTextContent(
			"Runs on slack.run.tools, not on this machine.",
		)
		await expect(hosting.querySelector("svg")).toHaveClass(
			"text-bot-badge-attention",
		)
		await expect(canvas.getByText("slack.run.tools")).toHaveClass("font-mono")

		const action = canvas.getByRole("button", { name: "Add an application" })
		await expect(action.querySelector("svg")).toBeNull()

		await expect(
			canvas.getByText(
				/This one runs on Smithery’s server, not on your machine\. Adding it reopens Rei’s session/,
			),
		).toBeVisible()
	},
})

export const HostedNothingToSetUp = meta.story({
	args: { application: HOSTED_NOTHING_INSTALL },
	parameters: {
		docs: {
			description: {
				story:
					"A hosted application that asks for neither a key nor a sign-in. Check that where it runs is stated once, in the hosting fact, and that the nothing-to-set-up line no longer claims this machine.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expect(
			canvas.getByText("Nothing to set up. No key, no sign-in."),
		).toBeVisible()
		await expect(
			canvas.queryByText(/runs on this machine/),
		).not.toBeInTheDocument()

		const facts = [
			...canvasElement.querySelectorAll('[data-slot="application-fact"]'),
		]
		await expect(facts).toHaveLength(2)
		await expect(facts[1]).toHaveTextContent(
			"Runs on slack.run.tools, not on this machine.",
		)
	},
})

export const ThemesKeyFieldAtRest = meta.story({
	globals: { theme_layout: "side-by-side" },
	args: { application: API_KEY_INSTALL },
	parameters: {
		a11y: A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS,
		docs: {
			description: {
				story:
					"The key field in light and dark side by side: the 1px `input` outline and the `radius-control` corner of the artboard V1e text field, filled with the `background` token so it keeps reading as a field on the `muted` key panel around it.",
			},
		},
	},
	play: async ({ canvas }) => {
		const fields = canvas.getAllByLabelText("Authorization")
		await expect(fields.length).toBe(2)
		for (const field of fields) {
			const frame = field.parentElement as HTMLElement
			const panel = frame.closest("section") as HTMLElement
			const style = getComputedStyle(frame)
			await expect(style.borderTopColor).toBe(
				probedStyleOf("border-input", "borderTopColor", panel),
			)
			await expect(style.borderTopLeftRadius).toBe(
				probedStyleOf("rounded-control", "borderTopLeftRadius", panel),
			)
			await expect(style.backgroundColor).toBe(
				probedStyleOf("bg-card", "backgroundColor", panel),
			)
			await expect(style.backgroundColor).not.toBe(
				getComputedStyle(panel).backgroundColor,
			)
		}
	},
})
