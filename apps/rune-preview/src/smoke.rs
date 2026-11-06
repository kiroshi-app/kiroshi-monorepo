use std::io::Write;
use std::process::ExitCode;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use crate::app::connected;
use crate::events::{self, HostEvent};
use crate::model::AgentEvent;
use crate::turn::{self, SendError};

const FIRST_DELTA_PATIENCE: Duration = Duration::from_secs(120);

enum Heard {
	Host(HostEvent),
	Sent(Result<(), SendError>),
}

pub fn run(text: &str) -> ExitCode {
	match smoke(text) {
		Ok(()) => ExitCode::SUCCESS,
		Err(failure) => {
			eprintln!("smoke-send failed: {failure}");
			ExitCode::FAILURE
		}
	}
}

fn smoke(text: &str) -> Result<(), String> {
	let ready =
		connected().map_err(|failure| format!("{} {}", failure.title(), failure.detail()))?;
	let conversation = ready.first_conversation_with_an_agent().ok_or_else(|| {
		format!("the dev profile has no conversation with an agent in {}", ready.space.name)
	})?;
	let agent = conversation.present().next().ok_or("the conversation lost its agent")?;
	println!("conversation: {} ({})", conversation.title, conversation.id);
	println!("summoned: {} ({})", agent.name, agent.bot_id);

	let (heard, hearing) = mpsc::channel();
	let host_heard = heard.clone();
	events::listen(&ready.host, move |event| {
		if host_heard.send(Heard::Host(event)).is_err() {
			eprintln!("a host event arrived after the smoke run ended");
		}
	});
	await_listening(&hearing)?;

	let host = ready.host.clone();
	let conversation_id = conversation.id.clone();
	let content = format!("<@{}> {text}", agent.bot_id);
	let summoned = vec![agent.bot_id.clone()];
	thread::spawn(move || {
		let sent = turn::send_turn(&host, &conversation_id, &content, &summoned);
		if heard.send(Heard::Sent(sent)).is_err() {
			eprintln!("the send answered after the smoke run ended");
		}
	});

	stream(&hearing, &conversation.id)
}

fn await_listening(hearing: &mpsc::Receiver<Heard>) -> Result<(), String> {
	match hearing.recv_timeout(FIRST_DELTA_PATIENCE) {
		Ok(Heard::Host(HostEvent::Listening)) => Ok(()),
		Ok(Heard::Host(HostEvent::Lost(reason))) => Err(format!("the event socket: {reason}")),
		Ok(_) => Err("the event socket spoke before it listened".to_owned()),
		Err(failure) => Err(format!("the event socket never opened: {failure}")),
	}
}

fn stream(hearing: &mpsc::Receiver<Heard>, conversation_id: &str) -> Result<(), String> {
	let started = Instant::now();
	let mut deltas = 0usize;
	let mut out = std::io::stdout();
	loop {
		let patience = if deltas == 0 {
			FIRST_DELTA_PATIENCE.saturating_sub(started.elapsed())
		} else {
			FIRST_DELTA_PATIENCE
		};
		let heard = match hearing.recv_timeout(patience) {
			Ok(heard) => heard,
			Err(RecvTimeoutError::Timeout) if deltas == 0 => {
				return Err(format!("no delta arrived within {}s", FIRST_DELTA_PATIENCE.as_secs()));
			}
			Err(RecvTimeoutError::Timeout) => {
				return Err(format!(
					"the turn went quiet for {}s after {deltas} deltas",
					FIRST_DELTA_PATIENCE.as_secs()
				));
			}
			Err(RecvTimeoutError::Disconnected) => return Err("every listener left".to_owned()),
		};
		match heard {
			Heard::Sent(Err(failure)) => return Err(format!("the send failed: {failure}")),
			Heard::Sent(Ok(())) => println!("sent: the host started the turn"),
			Heard::Host(HostEvent::Lost(reason)) => {
				return Err(format!("the socket dropped: {reason}"));
			}
			Heard::Host(HostEvent::Unreadable { event, cause }) => {
				return Err(format!("an unreadable {event} event: {cause}"));
			}
			Heard::Host(HostEvent::Agent(scoped)) => {
				let Some(scope) =
					scoped.scope.filter(|scope| scope.conversation_id == conversation_id)
				else {
					continue;
				};
				match scoped.event {
					AgentEvent::MessageDelta { text, .. } => {
						deltas += 1;
						let printed = writeln!(out, "delta {deltas} [{}]: {text:?}", scope.bot_id)
							.and_then(|()| out.flush());
						printed.map_err(|failure| format!("stdout refused a delta: {failure}"))?;
					}
					AgentEvent::TurnEnded { ended } if ended.outcome != "completed" => {
						return Err(format!("the turn ended {}", ended.outcome));
					}
					AgentEvent::TurnEnded { .. } if deltas == 0 => {
						return Err("the turn completed without a single delta".to_owned());
					}
					AgentEvent::TurnEnded { .. } => {
						println!("turn completed after {deltas} deltas");
						return Ok(());
					}
					AgentEvent::Failed { error } => {
						return Err(format!("the agent failed: {error}"));
					}
					_ => {}
				}
			}
			Heard::Host(HostEvent::Listening | HostEvent::MessageStored(_)) => {}
		}
	}
}
