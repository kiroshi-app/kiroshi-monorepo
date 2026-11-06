use rune::{El, col, el, row, text};
use rune_kit::{Button, ButtonVariant, ControlSize, Kit, TextInput};

use crate::app::{App, Screen};
use crate::tokens::{
	RADIUS_2XL, RADIUS_BUBBLE, RADIUS_XL, SPACING, TEXT_2XL_SEMIBOLD, TEXT_COMPACT,
	TEXT_COMPACT_MEDIUM, TEXT_READING, TEXT_SM, TEXT_SM_MEDIUM, Tokens,
};
use crate::widgets::avatar;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Step {
	Welcome(Page),
	Provider,
	Browser,
	ApiKey,
	Import,
	Account,
	AccountWaiting,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Page {
	Companions,
	Conversations,
	Spaces,
	Tools,
}

const PAGES: [Page; 4] = [Page::Companions, Page::Conversations, Page::Spaces, Page::Tools];

impl Step {
	pub fn first() -> Step {
		Step::Welcome(Page::Companions)
	}
}

impl Page {
	fn index(self) -> usize {
		PAGES.iter().position(|page| *page == self).unwrap_or(0)
	}

	fn title(self) -> &'static str {
		match self {
			Page::Companions => "Agents do the work with you",
			Page::Conversations => "Conversations, then missions",
			Page::Spaces => "Spaces keep work apart",
			Page::Tools => "Your tools, where you allow them",
		}
	}

	fn body(self) -> &'static str {
		match self {
			Page::Companions => {
				"Each agent has a name, a job and a memory of its own. Hand it something and it keeps at it, on your computer."
			}
			Page::Conversations => {
				"Talk with one agent or several at once. Long work becomes a mission you can follow while you do something else."
			}
			Page::Spaces => {
				"Each Space has its own agents, conversations and colour. Keep one to yourself, or share it with the people you work with."
			}
			Page::Tools => {
				"Give an agent a Folder to work in, the Applications it may use and the Secrets it needs. Nothing beyond what you hand it."
			}
		}
	}
}

const MEET: [(&str, &str, f32); 3] = [
	("Atlas", "Reviews code", 257.0),
	("Juniper", "Keeps the docs", 132.0),
	("Wren", "Writes release notes", 42.0),
];

fn go(step: Step) -> impl Fn(&mut App) + 'static {
	move |s: &mut App| s.screen = Screen::Onboarding(step)
}

fn finish(s: &mut App) {
	s.screen = Screen::Conversations;
}

pub fn view(step: Step, s: &App, k: &Kit, t: &Tokens) -> El {
	match step {
		Step::Welcome(page) => welcome(page, k, t),
		Step::Provider => provider(k, t),
		Step::Browser => browser(s, k, t),
		Step::ApiKey => api_key(s, k, t),
		Step::Import => import(k, t),
		Step::Account => account(k, t),
		Step::AccountWaiting => account_waiting(k, t),
	}
}

fn shell(t: &Tokens, content: El, controls: El) -> El {
	col()
		.key("onboarding")
		.w_full()
		.h_full()
		.fill(t.background)
		.padding(SPACING * 10.0)
		.child(el().h(SPACING * 6.0).w_full().window_drag())
		.child(
			col()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.center()
				.child(col().w(560.0).gap(SPACING * 8.0).child(content)),
		)
		.child(row().w_full().center().child(controls))
}

fn intro(t: &Tokens, title: &str, body: &str) -> El {
	col()
		.w_full()
		.gap(SPACING * 3.0)
		.items_center()
		.child(text(title.to_owned()).font(TEXT_2XL_SEMIBOLD).color(t.foreground))
		.child(
			text(body.to_owned())
				.font(TEXT_READING)
				.color(t.muted_foreground)
				.wrap()
				.align(rune::Align::Center),
		)
}

fn primary(k: &Kit, label: &str, on_press: impl Fn(&mut App) + 'static) -> El {
	Button::new(label)
		.variant(ButtonVariant::Contrast)
		.control_size(ControlSize::Large)
		.on_press(on_press)
		.build(k)
}

fn quiet(k: &Kit, label: &str, on_press: impl Fn(&mut App) + 'static) -> El {
	Button::new(label)
		.variant(ButtonVariant::Ghost)
		.control_size(ControlSize::Large)
		.on_press(on_press)
		.build(k)
}

fn card(t: &Tokens) -> El {
	col()
		.w_full()
		.padding(SPACING * 5.0)
		.gap(SPACING * 3.0)
		.radius(RADIUS_2XL)
		.fill(t.card)
		.border(1.0, t.border)
}

fn welcome(page: Page, k: &Kit, t: &Tokens) -> El {
	let at = page.index();
	let next = PAGES.get(at + 1).map_or(Step::Provider, |next| Step::Welcome(*next));
	let back = Step::Welcome(PAGES[at.saturating_sub(1)]);
	let illustration = match page {
		Page::Companions => companions(t),
		Page::Conversations => conversations(t),
		Page::Spaces => spaces(t),
		Page::Tools => tools(t),
	};
	let content = col().w_full().gap(SPACING * 8.0).child(illustration).child(intro(
		t,
		page.title(),
		page.body(),
	));
	let dots = row().gap(SPACING * 1.5).center_y().children(PAGES.iter().map(|dot| {
		let fill = if *dot == page { t.foreground } else { t.border };
		el().size(6.0, 6.0).radius(3.0).fill(fill)
	}));
	let advance = if at + 1 == PAGES.len() {
		primary(k, "Get started", go(next))
	} else {
		primary(k, "Next", go(next))
	};
	let controls = row()
		.w(560.0)
		.center_y()
		.justify_between()
		.child(
			Button::new("Back")
				.variant(ButtonVariant::Ghost)
				.control_size(ControlSize::Large)
				.disabled(at == 0)
				.on_press(go(back))
				.build(k),
		)
		.child(dots)
		.child(
			row()
				.gap(SPACING * 2.0)
				.child(quiet(k, "Skip intro", go(Step::Provider)))
				.child(advance),
		);
	shell(t, content, controls)
}

fn companions(t: &Tokens) -> El {
	row().w_full().gap(SPACING * 3.0).children(MEET.iter().map(|(name, job, hue)| {
		card(t)
			.grow(1.0)
			.items_center()
			.child(avatar(name, Some(*hue), 56.0))
			.child(text((*name).to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
			.child(text((*job).to_owned()).font(TEXT_COMPACT).color(t.muted_foreground))
	}))
}

fn conversations(t: &Tokens) -> El {
	let ask = row().w_full().justify_end().child(
		el().padding(SPACING * 3.0).radius(RADIUS_BUBBLE).fill(t.user_bubble).child(
			text("Can you two get the docs ready for Friday?")
				.font(TEXT_SM)
				.color(t.user_bubble_foreground),
		),
	);
	let reply = row().gap(SPACING * 2.0).center_y().child(avatar("Wren", Some(42.0), 24.0)).child(
		text("On it. I'll run the release notes as a mission.").font(TEXT_SM).color(t.foreground),
	);
	let mission = row()
		.w_full()
		.padding(SPACING * 3.0)
		.radius(RADIUS_XL)
		.fill(t.muted)
		.center_y()
		.justify_between()
		.child(
			col()
				.gap(SPACING)
				.child(text("Release notes for 2.4").font(TEXT_SM_MEDIUM).color(t.foreground))
				.child(
					text("Mission · Wren · 3 of 5 sections drafted")
						.font(TEXT_COMPACT)
						.color(t.muted_foreground),
				),
		)
		.child(text("Working").font(TEXT_COMPACT_MEDIUM).color(t.primary));
	card(t)
		.child(text("Launch week").font(TEXT_SM_MEDIUM).color(t.foreground))
		.child(ask)
		.child(reply)
		.child(mission)
}

fn spaces(t: &Tokens) -> El {
	let space = |name: &str, detail: &str, hue: f32, members: &[(&str, f32)]| {
		row()
			.w_full()
			.gap(SPACING * 3.0)
			.center_y()
			.child(el().size(10.0, 10.0).radius(5.0).fill(crate::tokens::avatar_hue(Some(hue)).ink))
			.child(
				col()
					.grow(1.0)
					.gap(SPACING)
					.child(text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
					.child(text(detail.to_owned()).font(TEXT_COMPACT).color(t.muted_foreground)),
			)
			.child(
				row()
					.gap(SPACING)
					.children(members.iter().map(|(member, hue)| avatar(member, Some(*hue), 24.0))),
			)
	};
	card(t)
		.child(space(
			"Work",
			"Shared with 3 people",
			257.0,
			&[("Atlas", 257.0), ("Juniper", 132.0)],
		))
		.child(space("Personal", "Only you", 296.0, &[("Wren", 42.0)]))
}

fn tools(t: &Tokens) -> El {
	let tool = |name: &str, detail: &str| {
		row()
			.w_full()
			.center_y()
			.justify_between()
			.child(text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
			.child(text(detail.to_owned()).font(TEXT_COMPACT).color(t.muted_foreground))
	};
	card(t)
		.child(tool("Folders", "~/Code/orbit-web"))
		.child(tool("Applications", "GitHub, Linear, Notion"))
		.child(tool("Secrets", "LINEAR_API_KEY"))
}

fn choice(t: &Tokens, key: &str, label: &str, description: &str, step: Step) -> El {
	col()
		.key(key)
		.w_full()
		.padding(SPACING * 4.0)
		.gap(SPACING)
		.radius(RADIUS_XL)
		.fill(t.card)
		.border(1.0, t.border)
		.hover(t.bubble)
		.cursor(rune::Cursor::Pointer)
		.focusable(true)
		.role("button")
		.label(label)
		.on_press(go(step))
		.child(text(label.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
		.child(text(description.to_owned()).font(TEXT_COMPACT).color(t.muted_foreground))
}

fn provider(k: &Kit, t: &Tokens) -> El {
	let content = col()
		.w_full()
		.gap(SPACING * 6.0)
		.child(intro(
			t,
			"Connect the model provider",
			"Your agents need a model to think with. Use your Claude subscription, or a key.",
		))
		.child(choice(
			t,
			"sign-in",
			"Sign in with Claude",
			"Opens your browser once. Works with your Pro or Max subscription.",
			Step::Browser,
		))
		.child(choice(
			t,
			"api-key",
			"Paste an API key",
			"Pay per use, with nothing to sign in to.",
			Step::ApiKey,
		));
	shell(t, content, row().child(quiet(k, "Back", go(Step::Welcome(Page::Tools)))))
}

fn browser(s: &App, k: &Kit, t: &Tokens) -> El {
	let content = col()
		.w_full()
		.gap(SPACING * 6.0)
		.child(intro(
			t,
			"Paste the code Claude gave you",
			"Your browser opened claude.ai. Sign in there with your Pro or Max subscription, then paste the code it shows you.",
		))
		.child(
			TextInput::new(&s.onboarding_code)
				.placeholder("Code from Claude")
				.large()
				.width(None)
				.on_edit(|s: &mut App| &mut s.onboarding_code)
				.build(k),
		)
		.child(text("Waiting for you to sign in, in your browser…").font(TEXT_COMPACT).color(t.faint_foreground));
	let controls = row()
		.gap(SPACING * 2.0)
		.child(quiet(k, "Paste a key instead", go(Step::ApiKey)))
		.child(primary(k, "Continue", go(Step::Import)));
	shell(t, content, controls)
}

fn api_key(s: &App, k: &Kit, t: &Tokens) -> El {
	let content = col()
		.w_full()
		.gap(SPACING * 6.0)
		.child(intro(
			t,
			"Paste your Anthropic API key",
			"Pay per use, with nothing to sign in to. Create a key in the Anthropic Console.",
		))
		.child(
			TextInput::new(&s.onboarding_key)
				.secure()
				.placeholder("sk-ant-…")
				.large()
				.width(None)
				.on_edit(|s: &mut App| &mut s.onboarding_key)
				.build(k),
		);
	let controls = row()
		.gap(SPACING * 2.0)
		.child(quiet(k, "Sign in instead", go(Step::Browser)))
		.child(primary(k, "Continue", go(Step::Import)));
	shell(t, content, controls)
}

fn import(k: &Kit, t: &Tokens) -> El {
	let content = intro(
		t,
		"Bring in your Claude Code setup",
		"Found in ~/.claude on your computer. Everything is selected; uncheck what you'd rather leave behind.",
	);
	let controls =
		row().gap(SPACING * 2.0).child(quiet(k, "Skip for now", go(Step::Account))).child(
			Button::new("Import")
				.variant(ButtonVariant::Contrast)
				.control_size(ControlSize::Large)
				.disabled(true)
				.build(k),
		);
	shell(t, content, controls)
}

fn ring(t: &Tokens) -> El {
	el().size(72.0, 72.0).radius(36.0).border(6.0, t.primary)
}

fn account(k: &Kit, t: &Tokens) -> El {
	let content = col().w_full().gap(SPACING * 8.0).items_center().child(ring(t)).child(intro(
		t,
		"Sign in to Kiroshi",
		"Optional. Host a space for people who aren't on your network, or join one someone hosts for you.",
	));
	let controls = row().gap(SPACING * 2.0).child(quiet(k, "Skip for now", finish)).child(primary(
		k,
		"Sign in with your browser",
		go(Step::AccountWaiting),
	));
	shell(t, content, controls)
}

fn account_waiting(k: &Kit, t: &Tokens) -> El {
	let content = col().w_full().gap(SPACING * 8.0).items_center().child(ring(t)).child(intro(
		t,
		"Waiting for your browser…",
		"Finish in your browser. Kiroshi picks it up from there.",
	));
	let controls = row()
		.gap(SPACING * 2.0)
		.child(quiet(k, "Cancel", go(Step::Account)))
		.child(primary(k, "Skip for now", finish));
	shell(t, content, controls)
}
