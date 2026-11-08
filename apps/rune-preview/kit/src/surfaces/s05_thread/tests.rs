use rune::{Cx, El, Env, Runtime};

use super::*;
use crate::tokens::Tokens;

type Heard = Vec<ThreadEvent>;

fn atlas() -> Agent {
	Agent { id: "atlas".to_owned(), name: "Atlas".to_owned(), hue: None, badge: None }
}

fn shown(transcript: Transcript, notice: Option<ThreadNotice>) -> Thread {
	Thread {
		kind: ThreadKind::Solo(atlas()),
		language: Language::En,
		space_hue: None,
		roster: vec![atlas()],
		transcript,
		notice,
	}
}

fn noticed(_: &Heard, _: &mut Cx<Heard>) -> El {
	let notice = ThreadNotice {
		title: "The agent stopped".to_owned(),
		description: "The agent exited (code 1). Restart the session.".to_owned(),
		action: "Restart session".to_owned(),
	};
	let emit: Emit<Heard> = Rc::new(|heard: &mut Heard, event| heard.push(event));
	thread(
		&Tokens::new(false),
		&Typesetter::default(),
		&shown(Transcript::Rows(Vec::new()), Some(notice)),
		&emit,
	)
}

fn failed_to_load(_: &Heard, _: &mut Cx<Heard>) -> El {
	let failure = Transcript::Failed {
		title: "Couldn't load this conversation.".to_owned(),
		detail: "The host didn't answer. Try again in a moment.".to_owned(),
	};
	let emit: Emit<Heard> = Rc::new(|heard: &mut Heard, event| heard.push(event));
	thread(&Tokens::new(false), &Typesetter::default(), &shown(failure, None), &emit)
}

fn running(view: fn(&Heard, &mut Cx<Heard>) -> El) -> Runtime<Heard> {
	let mut runtime = Runtime::new(Vec::new(), view, (1072.0, 847.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime
}

fn alerts(runtime: &Runtime<Heard>) -> usize {
	runtime.elements().into_iter().filter(|element| element.role == "alert").count()
}

fn press(runtime: &mut Runtime<Heard>, key: &str) {
	let [x, y, width, height] = runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.map(|element| element.rect)
		.unwrap_or_else(|| panic!("nothing is drawn under {key}"));
	runtime.pointer_down(x + width / 2.0, y + height / 2.0);
	runtime.pointer_up(x + width / 2.0, y + height / 2.0);
	runtime.frame(1.0 / 60.0);
}

#[test]
fn the_thread_notice_is_an_alert_whose_action_reports_the_notice_action() {
	let mut runtime = running(noticed);
	assert_eq!(alerts(&runtime), 1);
	press(&mut runtime, "button-Restart session");
	assert_eq!(runtime.state, [ThreadEvent::NoticeAction]);
}

#[test]
fn the_load_failure_is_an_alert_whose_retry_reports_a_new_load() {
	let mut runtime = running(failed_to_load);
	assert_eq!(alerts(&runtime), 1);
	press(&mut runtime, "button-Retry");
	assert_eq!(runtime.state, [ThreadEvent::RetryLoad]);
}
