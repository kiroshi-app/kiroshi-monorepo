use std::rc::Rc;

use rune::{El, col};

use kiroshi_rune_kit::strings::{Language, chat};
use kiroshi_rune_kit::surfaces::s05_thread::{
	Agent, Context, Emit, Thread, ThreadEvent, ThreadKind, ThreadNotice, pinned_messages, thread,
};
use kiroshi_rune_kit::tokens::Tokens;

use super::{Notice, projection, said};
use crate::app::App;
use crate::conversations::now_ms;
use crate::surfaces::{s06_composer, s07_approvals, s08_missions};

fn thread_event(app: &mut App, event: ThreadEvent) {
	if event == ThreadEvent::NoticeAction
		&& app.surfaces.s05_thread.notice.is_none()
		&& app.surfaces.s06_composer.dismiss_notice()
	{
		return;
	}
	match app.surfaces.s05_thread.handle(event, now_ms()) {
		Some(ThreadEvent::Mission(event)) => s08_missions::emitted(app, event),
		Some(forwarded) => {
			eprintln!("the thread forwards {forwarded:?}, which no surface handles yet")
		}
		None => {}
	}
}

fn emit() -> Emit<App> {
	Rc::new(thread_event)
}

fn thread_notice(title: &str, description: &str) -> ThreadNotice {
	ThreadNotice {
		title: title.to_owned(),
		description: description.to_owned(),
		action: said(chat::notice::DISMISS),
	}
}

fn shown_notice(app: &App) -> Option<ThreadNotice> {
	let thread = app.surfaces.s05_thread.notice.as_ref();
	let shown = thread.map(|Notice { title, description }| thread_notice(title, description));
	shown.or_else(|| {
		let composer = app.surfaces.s06_composer.notice();
		composer.map(|(title, description)| thread_notice(title, description))
	})
}

pub fn view(
	app: &App,
	t: &Tokens,
	kind: ThreadKind,
	roster: Vec<Agent>,
	space_hue: Option<f32>,
) -> Option<El> {
	let state = &app.surfaces.s05_thread;
	let open = state.open.as_ref()?;
	let events = s08_missions::thread_events(app);
	let shown = projection::Shown { kind: &kind, roster: &roster, events: &events, now: now_ms() };
	let transcript = projection::transcript(open, &shown);
	let prompts = s07_approvals::dock(app, &t.in_space(space_hue), &open.id, &roster);
	let data = Thread {
		kind,
		language: Language::En,
		space_hue,
		transcript,
		roster,
		notice: shown_notice(app),
	};
	let composer = s06_composer::view(app, t);
	Some(
		col()
			.w_full()
			.grow(1.0)
			.min_h(0.0)
			.child(thread(t, &app.math, &data, &emit()))
			.children(prompts)
			.children(composer),
	)
}

pub fn pinned_panel(app: &App, t: &Tokens, roster: &[Agent]) -> El {
	let pins = app
		.surfaces
		.s05_thread
		.open
		.as_ref()
		.map(|open| projection::pinned(open, roster, now_ms()))
		.unwrap_or_default();
	let emit = emit();
	let cx = Context { t, math: &app.math, language: Language::En, roster, emit: &emit };
	pinned_messages(&cx, &pins, false)
}
