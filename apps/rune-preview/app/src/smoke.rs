use std::io::Write;
use std::process::ExitCode;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::json;

use crate::app::{connected, whole_thread};
use crate::events::HostEvent;
use crate::host::{self, HostError, Profile};
use crate::longest;
use crate::model::{AgentEvent, ConversationMissions, MissionDetail, MissionOnBoard};
use crate::source::Source;
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
	let ready = connected(Profile::Dev)
		.map_err(|failure| format!("{} {}", failure.title(), failure.detail()))?;
	let conversation = ready.first_conversation_with_an_agent().ok_or_else(|| {
		format!("the dev profile has no conversation with an agent in {}", ready.space.name)
	})?;
	let agent = conversation.present().next().ok_or("the conversation lost its agent")?;
	println!("conversation: {} ({})", conversation.title, conversation.id);
	println!("summoned: {} ({})", agent.name, agent.bot_id);

	let (heard, hearing) = mpsc::channel();
	let host_heard = heard.clone();
	ready.source.listen(move |event| {
		if host_heard.send(Heard::Host(event)).is_err() {
			eprintln!("a host event arrived after the smoke run ended");
		}
	});
	await_listening(&hearing)?;

	let host = ready.source.clone();
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
			Heard::Host(
				HostEvent::Listening
				| HostEvent::AccountChanged(_)
				| HostEvent::MessageStored(_)
				| HostEvent::Companion(_)
				| HostEvent::Library(_)
				| HostEvent::Roster(_)
				| HostEvent::Approvals(_)
				| HostEvent::MissionChanged(_)
				| HostEvent::Lagged,
			) => {}
		}
	}
}

pub fn read() -> ExitCode {
	match read_only() {
		Ok(()) => ExitCode::SUCCESS,
		Err(failure) => {
			eprintln!("smoke-read failed: {failure}");
			ExitCode::FAILURE
		}
	}
}

fn read_only() -> Result<(), String> {
	let described = |failure: HostError| format!("{} {}", failure.title(), failure.detail());
	let ready = connected(Profile::Installed).map_err(described)?;
	println!("space read: {}", ready.space.id);
	println!("agents: {}", ready.agents.len());
	println!("conversations: {}", ready.conversations.len());
	let found = longest::longest(&ready.source, &ready.conversations).map_err(described)?;
	let found = found.ok_or("no conversation holds a message")?;
	let messages = whole_thread(&ready.source, &found.conversation_id).map_err(described)?;
	let title = ready
		.conversations
		.iter()
		.find(|conversation| conversation.id == found.conversation_id)
		.map_or("", |conversation| conversation.title.as_str());
	println!(
		"longest conversation: {} ({} messages, {} loaded)",
		found.conversation_id,
		found.messages,
		messages.len()
	);
	println!("longest title: {title}");
	read_one_mission(&ready.source).map_err(described)?;
	listen_to_missions(&ready.source)?;
	sent_only_reads()
}

fn read_one_mission(host: &Source) -> Result<(), HostError> {
	let board: Vec<MissionOnBoard> = host.invoke("mission_board", json!({}))?;
	println!("open missions: {}", board.len());
	let Some(entry) = board.iter().find(|entry| entry.mission.is_agent_running).or(board.first())
	else {
		return Ok(());
	};
	let detail: MissionDetail =
		host.invoke("mission_detail", json!({ "missionId": entry.mission.id }))?;
	let thread = whole_thread(host, &detail.mission.thread_conversation_id)?;
	let origin: ConversationMissions = host.invoke(
		"mission_list",
		json!({ "conversationId": detail.mission.origin_conversation_id }),
	)?;
	println!(
		"mission thread: {} ({:?}, agent running: {}, {} events, {} messages, {} missions in its conversation)",
		detail.mission.id,
		detail.mission.state,
		detail.mission.is_agent_running,
		detail.events.len(),
		thread.len(),
		origin.open.len() + origin.done.len()
	);
	Ok(())
}

const MISSION_WATCH: Duration = Duration::from_secs(30);

fn listen_to_missions(host: &Source) -> Result<(), String> {
	let (sender, heard) = mpsc::channel();
	host.listen(move |event| {
		if sender.send(event).is_err() {
			eprintln!("a host event arrived after the watch ended");
		}
	});
	let until = Instant::now() + MISSION_WATCH;
	let mut changes = 0;
	while let Some(left) = until.checked_duration_since(Instant::now()) {
		match heard.recv_timeout(left) {
			Ok(HostEvent::MissionChanged(changed)) => {
				changes += 1;
				println!(
					"mission://changed {} -> {:?}, agent running: {}",
					changed.mission_id, changed.state, changed.is_agent_running
				);
			}
			Ok(HostEvent::Lost(reason)) => return Err(format!("the socket dropped: {reason}")),
			Ok(_) | Err(RecvTimeoutError::Timeout) => {}
			Err(RecvTimeoutError::Disconnected) => return Err("the listener left".to_owned()),
		}
	}
	println!("mission changes heard in {}s: {changes}", MISSION_WATCH.as_secs());
	Ok(())
}

fn sent_only_reads() -> Result<(), String> {
	let sent = host::sent_commands();
	let mut counted: Vec<(String, usize)> = Vec::new();
	for (_, command) in &sent {
		match counted.iter_mut().find(|(held, _)| held == command) {
			Some((_, count)) => *count += 1,
			None => counted.push((command.clone(), 1)),
		}
	}
	for (command, count) in &counted {
		println!("sent {command} x{count}");
	}
	let writes: Vec<&str> = counted
		.iter()
		.map(|(command, _)| command.as_str())
		.filter(|command| !host::is_read(command))
		.collect();
	println!("requests: {}, writes: {}", sent.len(), writes.len());
	if writes.is_empty() {
		return Ok(());
	}
	Err(format!("sent commands outside the reads: {}", writes.join(", ")))
}
