import { REPOSITORY_URL, WEBSITE_COPY } from "./copy"

export const SUPPORT_EMAIL = "support@kiroshi.app"

const RELAY_HOST = "api.kiroshi.app"

const REPOSITORY_ADDRESS = REPOSITORY_URL.replace(/^https:\/\//, "")

const { pro } = WEBSITE_COPY.pricing

const PLACEHOLDER = "This section is being written."

export const SITE_PAGES_COPY = {
	footerNavigation: "Site",
	homeLink: "Kiroshi home",
	privacy: {
		navLabel: "Privacy",
		title: "Privacy policy",
		sections: [
			{ heading: "What we collect", body: PLACEHOLDER },
			{ heading: "Where messages go", body: PLACEHOLDER },
			{ heading: "Third-party AI providers", body: PLACEHOLDER },
			{ heading: "How to delete your account", body: PLACEHOLDER },
		],
	},
	terms: {
		navLabel: "Terms",
		title: "Terms of Use",
		sections: [
			{
				heading: "Who provides the service",
				body: [
					"Kiroshi is an independent project run from France by Steve Puget. In these terms, “we” and “us” mean Kiroshi.",
					"These terms cover Kiroshi’s hosted service and your Kiroshi account. If you don’t agree with them, don’t create an account or use the online mode.",
				],
			},
			{
				heading: "What the service is",
				body: [
					"Kiroshi is a desktop app where you talk with Companions in Conversations. The desktop app is free to use locally, on your computer and in Spaces shared on your own network.",
					`The online mode runs through our relay at ${RELAY_HOST}. It lets you host a Space for people who aren’t on your network and join a Space off your local network.`,
					"The iPhone app is part of the online mode. It signs in to your Kiroshi account and reaches your Spaces through the relay.",
				],
			},
			{
				heading: "Accounts and eligibility",
				body: [
					"You must be at least 16 to create a Kiroshi account.",
					"You need an account for the online mode and the iPhone app. The desktop app works locally without one.",
				],
			},
			{
				heading: "The Pro plan and the beta",
				body: [
					`The online mode is the Pro plan. Pro is priced per user: ${pro.price} ${pro.period} billed yearly, or ${pro.monthlyPrice} ${pro.period} billed monthly.`,
					"Pro is free during the beta. Payment isn’t set up, so you can’t be charged.",
					"If paid billing starts, we’ll announce it before it applies to an existing account. Nothing about Pro is promised beyond the beta.",
				],
			},
			{
				heading: "Acceptable use",
				body: [
					"Use Kiroshi lawfully. Don’t use the relay to harm other people, to get into accounts or systems you’re not allowed to use, or to disrupt the service for others.",
					"You’re responsible for what your Companions do, in your Conversations and through the Applications you give them.",
					"You’re responsible for the Secrets you store in Kiroshi, and for having the right to use them.",
				],
			},
			{
				heading: "Your content and the model provider",
				body: [
					"You bring your own Claude account or Anthropic API key. Kiroshi doesn’t resell model usage.",
					"What your Companions send to the model provider falls under that provider’s terms, not these.",
					"In the online mode, your Conversations pass through the relay to reach the people in your Space and your iPhone.",
				],
			},
			{
				heading: "The open-source code",
				body: [
					`Kiroshi’s source code is published under the MIT license at ${REPOSITORY_ADDRESS}.`,
					"These terms govern the hosted service and your account. They never change the license of the code.",
				],
			},
			{
				heading: "Availability and changes to the service",
				body: [
					"The online mode is in beta. The relay can be unavailable at times.",
					"We can change, add or remove features of the service.",
				],
			},
			{
				heading: "Termination",
				body: [
					"You can delete your account at any time from the app. Deleting it in the app deletes it on the relay.",
					"We can suspend or close your account if you breach these terms.",
					"Once your account is closed, the online mode stops for you. The desktop app stays free to use locally.",
				],
			},
			{
				heading: "Warranties and limitation of liability",
				body: [
					"The service is provided as it is, during a beta, with no warranty beyond what the law requires.",
					"As far as the law allows, we aren’t liable for what your Companions do, for what the model provider does, or for loss caused by the service being unavailable.",
					"Nothing in these terms limits the rights French law gives you as a consumer and that can’t be waived.",
				],
			},
			{
				heading: "Governing law",
				body: "These terms are governed by French law. Any dispute goes to the courts of France.",
			},
			{
				heading: "Changes to these terms",
				body: [
					"We can update these terms. The date below shows when they last changed.",
					"Last updated 15 October 2026.",
				],
			},
		],
		contact: {
			heading: "Contact",
			body: "Questions about these terms or your account go to this address.",
		},
	},
	support: {
		navLabel: "Support",
		title: "Support",
		topics: {
			heading: "What to write to us about",
			body: "Write to us about a bug, a question about how Kiroshi works, a privacy request, or billing once the Pro plan is paid.",
		},
		contact: {
			heading: "How to reach us",
			body: "Email us at the address below. For bugs and feature requests, you can also open an issue on GitHub.",
			issuesLink: "Open an issue on GitHub",
		},
		details: {
			heading: "What helps us answer",
			body: "Tell us the app version, your macOS or iOS version, what happened, and what you expected to happen.",
		},
		privacy: {
			heading: "Privacy and account deletion",
			body: "Send privacy requests (access to your data, deletion of your account, or any question about your data) to the same address. You can also delete your account yourself from Settings in the iPhone app.",
		},
		response: {
			heading: "When we answer",
			body: "One person reads and answers every message, within a few working days.",
		},
		operator: {
			heading: "Who runs Kiroshi",
			body: "Kiroshi, an independent project run from France by Steve Puget.",
		},
	},
}
