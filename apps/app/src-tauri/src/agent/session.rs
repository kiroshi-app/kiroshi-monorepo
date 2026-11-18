use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::{mpsc, oneshot, Mutex, Notify};

use super::contract::{
	AgentEvent, ConnectionState, PermissionDecision, SubmittedTurn, TransportError, TurnEnded,
	TurnFailure, TurnHold, TurnHoldReason, TurnOutcome, TurnState,
};
use super::lease::{Expiry, Lapse, Liveness, RunLease};
use super::protocol::{
	self, ClosedFrame, Frame, HostAnswer, HostRequestFrame, OpenRequest, ResultFrame, SpaceMember,
	StreamEvent, StreamEventFrame,
};
use super::sidecar::Sidecar;
use super::translate::Translator;
use crate::environment::contract::{ResolvedEnv, Values};

pub const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

pub const PARTIAL_MESSAGES: &str = "partialMessages";

pub enum FollowUp {
	Started,
	FoldedIn,
	Settled(Vec<AgentEvent>),
}

pub trait EventSink: Send + Sync + 'static {
	fn emit(&self, event: AgentEvent);

	fn submitted(&self, _turn: SubmittedTurn) {}

	fn follow_up(&self, step: FollowUp) {
		if let FollowUp::Settled(events) = step {
			for event in events {
				self.emit(event);
			}
		}
	}

	fn withdrawn(&self) {}

	fn drained(&self) -> Drained {
		Box::pin(std::future::ready(()))
	}
}

pub type Drained = Pin<Box<dyn Future<Output = ()> + Send>>;

pub type Answering = Pin<Box<dyn Future<Output = HostAnswer> + Send>>;

pub trait HostRequests: std::fmt::Debug + Send + Sync + 'static {
	fn subtype(&self) -> &'static str;

	fn serve(&self, request: Value) -> Answering;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StrandedTurn {
	pub turn_id: String,
	pub handed: Option<SubmittedTurn>,
	pub prompt: String,
	pub sdk_session_id: Option<String>,
}

pub type Keeping = Pin<Box<dyn Future<Output = ()> + Send>>;

pub trait StrandedTurns: std::fmt::Debug + Send + Sync + 'static {
	fn keep(&self, stranded: StrandedTurn) -> Keeping;
}

impl EventSink for mpsc::UnboundedSender<AgentEvent> {
	fn emit(&self, event: AgentEvent) {
		let _ = self.send(event);
	}
}

enum Gate {
	Buffering(Vec<AgentEvent>),
	Forwarding,
	Discarding,
}

pub struct GatedSink {
	inner: Arc<dyn EventSink>,
	gate: std::sync::Mutex<Gate>,
}

impl GatedSink {
	pub fn new(inner: Arc<dyn EventSink>) -> Self {
		Self { inner, gate: std::sync::Mutex::new(Gate::Buffering(Vec::new())) }
	}

	pub fn promote(&self) {
		let mut gate = self.gate.lock().expect("gate");
		if let Gate::Buffering(buffered) = std::mem::replace(&mut *gate, Gate::Forwarding) {
			for event in buffered {
				self.inner.emit(event);
			}
		}
	}

	pub fn discard(&self) {
		*self.gate.lock().expect("gate") = Gate::Discarding;
	}
}

impl EventSink for GatedSink {
	fn emit(&self, event: AgentEvent) {
		let mut gate = self.gate.lock().expect("gate");
		match &mut *gate {
			Gate::Buffering(buffered) => buffered.push(event),
			Gate::Forwarding => self.inner.emit(event),
			Gate::Discarding => {}
		}
	}

	fn submitted(&self, turn: SubmittedTurn) {
		self.inner.submitted(turn);
	}

	fn follow_up(&self, step: FollowUp) {
		self.inner.follow_up(step);
	}

	fn withdrawn(&self) {
		self.inner.withdrawn();
	}

	fn drained(&self) -> Drained {
		self.inner.drained()
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Bundle {
	pub path: String,
	pub system_path: Option<String>,
	pub user_path: Option<String>,
	pub space_path: Option<String>,
	pub agent: String,
	pub identity: String,
	pub output_style: String,
	pub settings_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionOptions {
	pub cwd: PathBuf,
	pub resume: Option<String>,
	pub bundle: Option<Bundle>,
	pub app_data_dir: Option<PathBuf>,
	pub conversation_id: Option<String>,
	pub startup_timeout: Duration,
	pub extra_env: Vec<(String, String)>,
	pub server_env: ResolvedEnv,
	pub connection: Values,
	pub output_schema: Option<serde_json::Value>,
	pub denied_tools: Vec<String>,
	pub permission_mode: Option<String>,
	pub mission_thread: bool,
	pub members: Vec<SpaceMember>,
	pub hosts: Vec<Arc<dyn HostRequests>>,
	pub lease: RunLease,
	pub strands: Option<Arc<dyn StrandedTurns>>,
}

impl SessionOptions {
	pub fn new(cwd: PathBuf) -> Self {
		Self {
			cwd,
			resume: None,
			bundle: None,
			app_data_dir: None,
			conversation_id: None,
			startup_timeout: DEFAULT_STARTUP_TIMEOUT,
			extra_env: Vec::new(),
			server_env: ResolvedEnv::default(),
			connection: Values::new(),
			output_schema: None,
			denied_tools: Vec::new(),
			permission_mode: None,
			mission_thread: false,
			members: Vec::new(),
			hosts: Vec::new(),
			lease: RunLease::default(),
			strands: None,
		}
	}

	pub fn resuming(mut self, session_id: Option<String>) -> Self {
		self.resume = session_id;
		self
	}

	pub fn bundled(mut self, bundle: Option<Bundle>) -> Self {
		self.bundle = bundle;
		self
	}

	pub fn with_app_data(mut self, dir: Option<PathBuf>) -> Self {
		self.app_data_dir = dir;
		self
	}

	pub fn in_conversation(mut self, conversation_id: impl Into<String>) -> Self {
		self.conversation_id = Some(conversation_id.into());
		self
	}

	pub fn with_env(mut self, key: &str, value: impl Into<String>) -> Self {
		self.extra_env.push((key.to_owned(), value.into()));
		self
	}

	pub fn serving(mut self, server_env: ResolvedEnv) -> Self {
		self.server_env = server_env;
		self
	}

	pub fn connected(mut self, connection: Values) -> Self {
		self.connection = connection;
		self
	}

	pub fn hosting(mut self, host: Arc<dyn HostRequests>) -> Self {
		self.hosts.push(host);
		self
	}

	pub fn answering(mut self, output_schema: Option<serde_json::Value>) -> Self {
		self.output_schema = output_schema;
		self
	}

	pub fn denying(mut self, denied_tools: Vec<String>) -> Self {
		self.denied_tools = denied_tools;
		self
	}

	pub fn under_mode(mut self, permission_mode: Option<String>) -> Self {
		self.permission_mode = permission_mode;
		self
	}

	pub fn on_mission_thread(mut self, mission_thread: bool) -> Self {
		self.mission_thread = mission_thread;
		self
	}

	pub fn read_by(mut self, members: Vec<SpaceMember>) -> Self {
		self.members = members;
		self
	}

	pub fn leased(mut self, lease: RunLease) -> Self {
		self.lease = lease;
		self
	}

	pub fn stranding(mut self, strands: Arc<dyn StrandedTurns>) -> Self {
		self.strands = Some(strands);
		self
	}

	pub fn open_request(&self, partial_messages: bool) -> OpenRequest {
		OpenRequest {
			cwd: self.cwd.to_string_lossy().into_owned(),
			resume: self.resume.clone(),
			plugin_path: self.bundle.as_ref().map(|bundle| bundle.path.clone()),
			system_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.system_path.clone()),
			user_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.user_path.clone()),
			space_plugin_path: self.bundle.as_ref().and_then(|bundle| bundle.space_path.clone()),
			agent: self.bundle.as_ref().map(|bundle| bundle.agent.clone()),
			identity: self.bundle.as_ref().map(|bundle| bundle.identity.clone()),
			output_style: self.bundle.as_ref().map(|bundle| bundle.output_style.clone()),
			settings_path: self.bundle.as_ref().and_then(|bundle| bundle.settings_path.clone()),
			app_data_dir: self.app_data_dir.as_ref().map(|dir| dir.to_string_lossy().into_owned()),
			conversation_id: self.conversation_id.clone(),
			partial_messages,
			env: self.extra_env.iter().cloned().collect(),
			server_env: self.server_env.clone(),
			connection: self.connection.clone(),
			output_schema: self.output_schema.clone(),
			denied_tools: self.denied_tools.clone(),
			permission_mode: self.permission_mode.clone(),
			mission_thread: self.mission_thread,
			members: self.members.clone(),
		}
	}
}

struct Shared {
	key: String,
	reopening: OpenRequest,
	translator: Translator,
	turn: TurnState,
	shutting_down: bool,
	running: Option<RunningTurn>,
	queued: VecDeque<QueuedPrompt>,
	lease: RunLease,
	streams_a_follow_up: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Handed {
	Delivered,
	Queued,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LinePlace {
	Running,
	Queued,
	Absent,
}

struct QueuedPrompt {
	text: String,
	turn: SubmittedTurn,
}

struct RunningTurn {
	id: Option<String>,
	prompt_uuid: String,
	started_at: Instant,
	liveness: Liveness,
	pending_tasks: u32,
	origin: TurnOrigin,
}

enum TurnOrigin {
	Prompted { text: String, handed: Option<SubmittedTurn> },
	Answered,
	Replay { of: String },
}

impl RunningTurn {
	fn held_on(&mut self, count: u32) -> Option<AgentEvent> {
		if self.pending_tasks == count {
			return None;
		}
		self.pending_tasks = count;
		let hold =
			(count > 0).then_some(TurnHold { reason: TurnHoldReason::BackgroundTasks, count });
		Some(AgentEvent::TurnHeld { hold })
	}

	fn released(&self) -> Option<AgentEvent> {
		(self.pending_tasks > 0).then_some(AgentEvent::TurnHeld { hold: None })
	}
}

impl Shared {
	fn is_mid_turn(&self) -> bool {
		matches!(self.turn, TurnState::Submitting | TurnState::Running | TurnState::Stopping)
	}

	fn set_turn(&mut self, next: TurnState) -> Option<AgentEvent> {
		if self.turn == next {
			return None;
		}
		self.turn = next;
		Some(AgentEvent::TurnChanged { state: next })
	}

	fn turn_started(
		&mut self,
		session: &str,
		id: Option<String>,
		prompt_uuid: String,
		origin: TurnOrigin,
	) {
		log::info!("the turn started session={session} turn={id:?}");
		self.running = Some(RunningTurn {
			id,
			prompt_uuid,
			started_at: Instant::now(),
			liveness: Liveness::since(tokio::time::Instant::now()),
			pending_tasks: 0,
			origin,
		});
	}

	fn stranded_by(&self, expiry: Expiry) -> Option<StrandedTurn> {
		let running = self.running.as_ref().filter(|_| expiry == Expiry::ProviderUnreachable)?;
		let TurnOrigin::Prompted { text, handed } = &running.origin else {
			return None;
		};
		Some(StrandedTurn {
			turn_id: handed
				.as_ref()
				.map_or_else(|| running.prompt_uuid.clone(), |handed| handed.turn_id.clone()),
			handed: handed.clone(),
			prompt: text.clone(),
			sdk_session_id: self.translator.session_id().map(str::to_owned),
		})
	}

	fn answers_the_running_prompt(&self, frame: &Frame) -> bool {
		let running = self.running.as_ref().map(|running| running.prompt_uuid.as_str());
		frame.answered_prompt().is_some_and(|answered| Some(answered) == running)
	}

	fn follow_up_of(&mut self, frame: &Frame) -> Option<FollowUp> {
		if !is_turn_activity(frame) {
			return None;
		}
		if self.answers_the_running_prompt(frame) {
			return std::mem::take(&mut self.streams_a_follow_up).then_some(FollowUp::FoldedIn);
		}
		if self.streams_a_follow_up || !self.opens_a_follow_up(frame) {
			return None;
		}
		self.streams_a_follow_up = true;
		Some(FollowUp::Started)
	}

	fn opens_a_follow_up(&self, frame: &Frame) -> bool {
		match self.turn {
			TurnState::Submitting => starts_a_reply(frame),
			_ => !self.is_mid_turn(),
		}
	}

	fn settles_the_follow_up_alone(&self, frame: &Frame) -> bool {
		matches!(frame, Frame::TurnSettled(_))
			&& self.streams_a_follow_up
			&& self.turn != TurnState::Stopping
			&& !self.answers_the_running_prompt(frame)
	}

	fn liveness(&mut self) -> Option<&mut Liveness> {
		self.running.as_mut().map(|running| &mut running.liveness)
	}

	fn heard(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.heard(tokio::time::Instant::now());
		}
	}

	fn provider_unreachable(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.provider_unreachable(tokio::time::Instant::now());
		}
	}

	fn provider_reached(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.provider_reached();
		}
	}

	fn result_held(&mut self) {
		if let Some(liveness) = self.liveness() {
			liveness.result_held(tokio::time::Instant::now());
		}
	}

	fn tasks_pending(&mut self, count: u32) -> Vec<AgentEvent> {
		let Some(running) = self.running.as_mut() else {
			return Vec::new();
		};
		log::info!(
			"the turn holds for its background tasks session={} turn={:?} reason={count} background tasks",
			self.key,
			running.id
		);
		let held = running.held_on(count);
		let entering = match self.turn {
			TurnState::Submitting => self.set_turn(TurnState::Running),
			_ => None,
		};
		entering.into_iter().chain([AgentEvent::TasksPending { count }]).chain(held).collect()
	}

	fn lease_deadline(&self) -> Option<(tokio::time::Instant, Expiry)> {
		let running = self.running.as_ref()?;
		running.liveness.deadline(self.lease, self.translator.is_waiting_on_person())
	}

	fn end_lapsed(&mut self, expiry: Expiry) -> Vec<AgentEvent> {
		let session = self.key.clone();
		log::warn!(
			"the turn lost its lease session={session} turn={:?} reason={expiry}",
			self.running.as_ref().and_then(|running| running.id.as_deref())
		);
		let failure = expiry.failure();
		let cause = match expiry {
			Expiry::Lapsed(lapse) => FailureCause::LeaseLapse(lapse),
			Expiry::ProviderUnreachable => FailureCause::ProviderUnreachable,
		};
		let mut events: Vec<AgentEvent> = self
			.turn_ended(&session, TurnOutcome::Failed, Some(failure), Some(cause))
			.into_iter()
			.collect();
		events.extend(self.translator.abandon_turn(failure));
		events.extend(self.set_turn(TurnState::Failed));
		if let Expiry::Lapsed(lapse) = expiry {
			let bound_ms = self.lease.bound_of(lapse).as_millis() as u64;
			events
				.push(AgentEvent::Failed { error: TransportError::RunLapsed { lapse, bound_ms } });
		}
		events
	}

	fn reopen(
		&mut self,
		sidecar: &Sidecar,
	) -> (mpsc::UnboundedReceiver<Value>, Result<(), TransportError>) {
		let lapsed = std::mem::replace(&mut self.key, uuid::Uuid::new_v4().to_string());
		sidecar.detach(&lapsed);
		let frames = sidecar.attach(&self.key);
		let mut request = self.reopening.clone();
		request.resume = self.translator.session_id().map(str::to_owned).or(request.resume);
		let written = sidecar
			.send(protocol::close_command(&lapsed))
			.and_then(|()| sidecar.send(protocol::open_command(&self.key, &request)));
		log::info!("the session reopened after a lapse lapsed={lapsed} session={}", self.key);
		(frames, written)
	}

	#[must_use]
	fn turn_ended(
		&mut self,
		session: &str,
		outcome: TurnOutcome,
		failure: Option<TurnFailure>,
		cause: Option<FailureCause>,
	) -> Option<AgentEvent> {
		self.streams_a_follow_up = false;
		let running = self.running.take()?;
		let reason = failure.map_or(String::new(), |failure| format!(" reason={failure:?}"));
		let cause = cause.map(|cause| format!(" cause={cause}")).unwrap_or_default();
		let replay = match &running.origin {
			TurnOrigin::Replay { of } => format!(" replay=true original={of}"),
			TurnOrigin::Prompted { .. } | TurnOrigin::Answered => String::new(),
		};
		log::info!(
			"the turn ended session={session} turn={:?} outcome={outcome:?}{reason}{replay} took_ms={}{cause}",
			running.id,
			running.started_at.elapsed().as_millis()
		);
		running.released()
	}

	fn ended_by_shutdown(&mut self, session: &str) -> Vec<AgentEvent> {
		if self.running.is_none() {
			return Vec::new();
		}
		log::info!("the session shut down while its turn ran session={session}");
		let released = self.turn_ended(session, TurnOutcome::Cancelled, None, None);
		released.into_iter().chain([self.ended_as(TurnOutcome::Cancelled, None)]).collect()
	}

	fn ended_as(&self, outcome: TurnOutcome, failure: Option<TurnFailure>) -> AgentEvent {
		AgentEvent::TurnEnded {
			ended: TurnEnded {
				session_id: self.translator.session_id().map(str::to_owned),
				outcome,
				failure,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
				web_sources: Vec::new(),
			},
		}
	}

	fn abandon_queued(&mut self, outcome: TurnOutcome, failure: Option<TurnFailure>) -> Abandoned {
		let turns: Vec<SubmittedTurn> = self.queued.drain(..).map(|queued| queued.turn).collect();
		for turn in &turns {
			log::info!("a queued prompt was dropped session={} turn={}", self.key, turn.turn_id);
		}
		Abandoned { turns, ended: self.ended_as(outcome, failure) }
	}
}

const CAUSE_TEXT_BOUND: usize = 300;

#[derive(Debug, Clone, PartialEq)]
enum FailureCause {
	ErrorResult { subtype: Option<String>, text: Option<String> },
	SessionClosed { reason: String },
	LeaseLapse(Lapse),
	ProviderUnreachable,
	PromptUnwritten { reason: String },
	InterruptRefused { reason: Option<String> },
}

impl FailureCause {
	fn told_by(frame: &Frame) -> Option<Self> {
		match frame {
			Frame::Result(result) | Frame::TurnSettled(result) => {
				Some(Self::ErrorResult { subtype: result.subtype.clone(), text: text_of(result) })
			}
			Frame::InterruptFailed(refused) => {
				Some(Self::InterruptRefused { reason: refused.detail.clone() })
			}
			_ => None,
		}
	}

	fn closed_by(reason: Option<&TransportError>) -> Self {
		let reason = match reason {
			Some(TransportError::Crashed { detail: Some(detail), .. }) => detail.clone(),
			Some(error) => error.to_string(),
			None => "the sidecar stopped routing frames to the session".to_owned(),
		};
		Self::SessionClosed { reason }
	}
}

impl std::fmt::Display for FailureCause {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::ErrorResult { subtype, text } => {
				write!(f, "error result subtype={subtype:?} text={text:?}")
			}
			Self::SessionClosed { reason } => write!(f, "session closed reason={reason:?}"),
			Self::LeaseLapse(lapse) => write!(f, "lease lapse reason={lapse:?}"),
			Self::ProviderUnreachable => write!(f, "provider unreachable past its bound"),
			Self::PromptUnwritten { reason } => write!(f, "prompt unwritten reason={reason:?}"),
			Self::InterruptRefused { reason } => write!(f, "interrupt refused reason={reason:?}"),
		}
	}
}

fn text_of(result: &ResultFrame) -> Option<String> {
	let told = result.errors.as_ref().or(result.result.as_ref())?;
	let text = match told {
		Value::String(text) => text.clone(),
		Value::Array(items) => items.iter().map(spoken).collect::<Vec<_>>().join("; "),
		other => other.to_string(),
	};
	Some(text.chars().take(CAUSE_TEXT_BOUND).collect())
}

fn spoken(item: &Value) -> String {
	item.as_str().map_or_else(|| item.to_string(), str::to_owned)
}

struct Abandoned {
	turns: Vec<SubmittedTurn>,
	ended: AgentEvent,
}

impl Abandoned {
	fn tell(self, sink: &dyn EventSink) {
		for turn in self.turns {
			sink.submitted(turn);
			sink.emit(self.ended.clone());
		}
	}
}

struct Line<'a> {
	sidecar: &'a Sidecar,
	sink: &'a dyn EventSink,
	rearmed: &'a Notify,
}

impl Line<'_> {
	fn deliver(
		&self,
		shared: &mut Shared,
		text: &str,
		turn: Option<SubmittedTurn>,
	) -> Result<(), TransportError> {
		let key = shared.key.clone();
		let prompt_uuid = uuid::Uuid::new_v4().to_string();
		shared.turn_started(
			&key,
			turn.as_ref().map(|turn| turn.turn_id.clone()),
			prompt_uuid.clone(),
			TurnOrigin::Prompted { text: text.to_owned(), handed: turn.clone() },
		);
		let entering = shared.set_turn(TurnState::Submitting);
		self.rearmed.notify_one();
		let handed = turn.is_some();
		if let Some(turn) = turn {
			self.sink.submitted(turn);
		}
		if let Some(entering) = entering {
			self.sink.emit(entering);
		}
		let written = self.sidecar.send(protocol::prompt_command(&key, text, &prompt_uuid));
		if let Err(error) = &written {
			let cause = FailureCause::PromptUnwritten { reason: error.to_string() };
			let failure = Some(TurnFailure::AgentLost);
			if let Some(released) =
				shared.turn_ended(&key, TurnOutcome::Failed, failure, Some(cause))
			{
				self.sink.emit(released);
			}
		}
		if written.is_err() && handed {
			self.sink.withdrawn();
		}
		written
	}

	fn deliver_next(&self, shared: &mut Shared) {
		if shared.is_mid_turn() {
			return;
		}
		let Some(next) = shared.queued.pop_front() else {
			return;
		};
		if let Err(error) = self.deliver(shared, &next.text, Some(next.turn)) {
			self.sink.emit(AgentEvent::Failed { error });
		}
	}
}

pub struct Session {
	sidecar: Arc<Sidecar>,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	resumed: bool,
	rearmed: Arc<Notify>,
}

impl Session {
	pub async fn start(
		sidecar: Arc<Sidecar>,
		options: SessionOptions,
		sink: Arc<dyn EventSink>,
	) -> Result<Self, TransportError> {
		let opening_at = Instant::now();
		let resumed = options.resume.is_some();
		let key = uuid::Uuid::new_v4().to_string();
		let frames = sidecar.attach(&key);
		let request = options.open_request(sidecar.supports(PARTIAL_MESSAGES));

		let shared = Arc::new(Mutex::new(Shared {
			key: key.clone(),
			reopening: request.clone(),
			translator: Translator::new(resumed),
			turn: TurnState::Idle,
			shutting_down: false,
			running: None,
			queued: VecDeque::new(),
			lease: options.lease,
			streams_a_follow_up: false,
		}));
		let rearmed = Arc::new(Notify::new());

		let (opened_tx, opened_rx) = oneshot::channel::<Result<(), TransportError>>();
		let desk = HostDesk {
			sidecar: sidecar.clone(),
			key: key.clone(),
			hosts: options.hosts.clone(),
			strands: options.strands.clone(),
			sink: sink.clone(),
		};
		tokio::spawn(read_loop(
			frames,
			shared.clone(),
			sink.clone(),
			opened_tx,
			desk,
			rearmed.clone(),
		));

		let session = Self { sidecar, shared, sink, resumed, rearmed };
		if let Err(error) = session.write(protocol::open_command(&key, &request)) {
			session.sidecar.detach(&key);
			return Err(error);
		}

		let logged_key = key;
		let opened = match tokio::time::timeout(options.startup_timeout, opened_rx).await {
			Ok(Ok(Ok(()))) => Ok(session),
			Ok(Ok(Err(error))) => {
				session.shutdown().await;
				Err(error)
			}
			Ok(Err(_)) => {
				session.shutdown().await;
				Err(TransportError::Crashed {
					code: None,
					detail: Some("the sidecar dropped the session during startup".into()),
				})
			}
			Err(_) => {
				session.shutdown().await;
				Err(TransportError::StartupTimeout {
					timeout_ms: options.startup_timeout.as_millis() as u64,
				})
			}
		};
		let took_ms = opening_at.elapsed().as_millis();
		match &opened {
			Ok(_) => log::info!(
				"the session opened session={logged_key} resumed={resumed} took_ms={took_ms}"
			),
			Err(_) => log::warn!(
				"the session did not open session={logged_key} resumed={resumed} took_ms={took_ms}"
			),
		}
		opened
	}

	pub fn resumed(&self) -> bool {
		self.resumed
	}

	pub async fn session_id(&self) -> Option<String> {
		self.shared.lock().await.translator.session_id().map(str::to_owned)
	}

	pub async fn turn_state(&self) -> TurnState {
		self.shared.lock().await.turn
	}

	fn write(&self, command: Value) -> Result<(), TransportError> {
		self.sidecar.send(command)
	}

	pub async fn submit_prompt(&self, text: &str) -> Result<(), TransportError> {
		self.submit(text, None).await
	}

	pub async fn submit(
		&self,
		text: &str,
		turn: Option<SubmittedTurn>,
	) -> Result<(), TransportError> {
		let mut shared = self.shared.lock().await;
		if let Some(asked) = shared.translator.take_question() {
			return self.answer_with_message(&mut shared, asked, text, turn);
		}
		if shared.is_mid_turn() {
			return Err(TransportError::TurnAlreadyRunning);
		}
		self.line().deliver(&mut shared, text, turn)
	}

	pub async fn submit_in_line(
		&self,
		text: &str,
		turn: SubmittedTurn,
	) -> Result<Handed, TransportError> {
		let mut shared = self.shared.lock().await;
		if let Some(asked) = shared.translator.take_question() {
			self.answer_with_message(&mut shared, asked, text, Some(turn))?;
			return Ok(Handed::Delivered);
		}
		if shared.is_mid_turn() {
			log::info!(
				"a prompt waits for the running turn session={} turn={}",
				shared.key,
				turn.turn_id
			);
			shared.queued.push_back(QueuedPrompt { text: text.to_owned(), turn });
			return Ok(Handed::Queued);
		}
		self.line().deliver(&mut shared, text, Some(turn))?;
		Ok(Handed::Delivered)
	}

	pub async fn replay(&self, stranded: StrandedTurn) -> Result<(), TransportError> {
		let mut shared = self.shared.lock().await;
		if shared.is_mid_turn()
			|| shared.streams_a_follow_up
			|| shared.translator.is_waiting_on_person()
		{
			return Err(TransportError::TurnAlreadyRunning);
		}
		self.line().deliver(&mut shared, &stranded.prompt, stranded.handed)?;
		if let Some(running) = shared.running.as_mut() {
			running.origin = TurnOrigin::Replay { of: stranded.turn_id };
		}
		Ok(())
	}

	pub async fn withdraw(&self, turn_id: &str) -> bool {
		let mut shared = self.shared.lock().await;
		let held = shared.queued.len();
		shared.queued.retain(|queued| queued.turn.turn_id != turn_id);
		shared.queued.len() < held
	}

	pub async fn place_of(&self, turn_id: &str) -> LinePlace {
		let shared = self.shared.lock().await;
		let running_id = shared.running.as_ref().and_then(|running| running.id.as_deref());
		if running_id == Some(turn_id) {
			return LinePlace::Running;
		}
		if shared.queued.iter().any(|queued| queued.turn.turn_id == turn_id) {
			return LinePlace::Queued;
		}
		LinePlace::Absent
	}

	pub async fn is_idle(&self) -> bool {
		let shared = self.shared.lock().await;
		!shared.is_mid_turn() && !shared.streams_a_follow_up && shared.queued.is_empty()
	}

	fn line(&self) -> Line<'_> {
		Line { sidecar: &self.sidecar, sink: self.sink.as_ref(), rearmed: &self.rearmed }
	}

	pub async fn cancel_turn(&self) -> Result<(), TransportError> {
		let (key, stopping) = {
			let mut shared = self.shared.lock().await;
			if !matches!(shared.turn, TurnState::Submitting | TurnState::Running) {
				return Err(TransportError::NoActiveTurn);
			}
			shared.translator.mark_cancelling();
			if let Some(liveness) = shared.liveness() {
				liveness.interrupted(tokio::time::Instant::now());
			}
			(shared.key.clone(), shared.set_turn(TurnState::Stopping))
		};
		self.rearmed.notify_one();
		self.emit(stopping);
		self.write(protocol::interrupt_command(&key))
	}

	async fn take_pending_input(&self, id: &str) -> Result<(String, Value), TransportError> {
		let mut shared = self.shared.lock().await;
		let input = shared
			.translator
			.take_permission_input(id)
			.ok_or_else(|| TransportError::UnknownPermission { id: id.to_owned() })?;
		shared.heard();
		self.rearmed.notify_one();
		Ok((shared.key.clone(), input))
	}

	pub async fn respond_to_permission(
		&self,
		id: &str,
		decision: PermissionDecision,
	) -> Result<(), TransportError> {
		let (key, input) = self.take_pending_input(id).await?;

		let command = match decision {
			PermissionDecision::AllowOnce => protocol::allow_command(&key, id, &input),
			PermissionDecision::Deny => {
				protocol::deny_command(&key, id, "User denied this action.")
			}
		};
		self.write(command)?;
		self.sink.emit(AgentEvent::PermissionResolved { id: id.to_owned(), decision });
		Ok(())
	}

	pub async fn answer_question(
		&self,
		id: &str,
		answers: HashMap<String, String>,
		annotations: Option<Value>,
	) -> Result<(), TransportError> {
		let (key, input) = match self.take_pending_input(id).await {
			Err(TransportError::UnknownPermission { .. })
				if self.shared.lock().await.translator.was_answered_by_message(id) =>
			{
				return Ok(());
			}
			taken => taken?,
		};

		let answered = answered_input(input, answers, annotations);
		self.write(protocol::allow_command(&key, id, &answered))?;
		self.sink.emit(AgentEvent::PermissionResolved {
			id: id.to_owned(),
			decision: PermissionDecision::AllowOnce,
		});
		Ok(())
	}

	fn answer_with_message(
		&self,
		shared: &mut Shared,
		(id, input): (String, Value),
		text: &str,
		turn: Option<SubmittedTurn>,
	) -> Result<(), TransportError> {
		shared.heard();
		self.rearmed.notify_one();
		let answers = typed_answers(&input, text);
		let answered = answered_input(input, answers, None);
		self.write(protocol::allow_command(&shared.key, &id, &answered))?;
		self.sink
			.emit(AgentEvent::PermissionResolved { id, decision: PermissionDecision::AllowOnce });
		if let Some(turn) = turn {
			self.hand_the_running_turn_to(shared, turn);
		}
		Ok(())
	}

	fn hand_the_running_turn_to(&self, shared: &mut Shared, turn: SubmittedTurn) {
		let key = shared.key.clone();
		let answered_prompt = match shared.running.as_ref() {
			Some(running) => {
				let prompt_uuid = running.prompt_uuid.clone();
				let released = shared.turn_ended(&key, TurnOutcome::Completed, None, None);
				let ended = shared.ended_as(TurnOutcome::Completed, None);
				for event in released.into_iter().chain([ended]) {
					self.sink.emit(event);
				}
				prompt_uuid
			}
			None => uuid::Uuid::new_v4().to_string(),
		};
		let folds_a_follow_up = std::mem::take(&mut shared.streams_a_follow_up);
		shared.turn_started(
			&key,
			Some(turn.turn_id.clone()),
			answered_prompt,
			TurnOrigin::Answered,
		);
		self.sink.submitted(turn);
		if folds_a_follow_up {
			self.sink.follow_up(FollowUp::FoldedIn);
		}
		shared.turn = TurnState::Running;
		self.sink.emit(AgentEvent::TurnChanged { state: TurnState::Running });
	}

	fn emit(&self, event: Option<AgentEvent>) {
		if let Some(event) = event {
			self.sink.emit(event);
		}
	}

	pub async fn shutdown(&self) {
		let key = {
			let mut shared = self.shared.lock().await;
			shared.shutting_down = true;
			let key = shared.key.clone();
			for id in shared.translator.abandon_prompts() {
				self.sink.emit(AgentEvent::PermissionResolved {
					id,
					decision: PermissionDecision::Deny,
				});
			}
			for ended in shared.ended_by_shutdown(&key) {
				self.sink.emit(ended);
			}
			shared.abandon_queued(TurnOutcome::Cancelled, None).tell(self.sink.as_ref());
			key
		};
		self.sink.drained().await;
		let _ = self.write(protocol::close_command(&key));
		self.sidecar.detach(&key);
	}
}

fn typed_answers(input: &Value, text: &str) -> HashMap<String, String> {
	input
		.get("questions")
		.and_then(Value::as_array)
		.into_iter()
		.flatten()
		.filter_map(|asked| asked.get("question").and_then(Value::as_str))
		.map(|question| (question.to_owned(), text.to_owned()))
		.collect()
}

fn answered_input(
	input: Value,
	answers: HashMap<String, String>,
	annotations: Option<Value>,
) -> Value {
	let mut fields = match input {
		Value::Object(fields) => fields,
		_ => serde_json::Map::new(),
	};
	fields.insert("answers".to_owned(), serde_json::json!(answers));
	if let Some(annotations) = annotations {
		fields.insert("annotations".to_owned(), annotations);
	}
	Value::Object(fields)
}

impl From<TurnOutcome> for TurnState {
	fn from(outcome: TurnOutcome) -> Self {
		match outcome {
			TurnOutcome::Failed => TurnState::Failed,
			TurnOutcome::Completed | TurnOutcome::Cancelled => TurnState::Idle,
		}
	}
}

fn turn_ending(events: &[AgentEvent]) -> Option<(TurnOutcome, Option<TurnFailure>)> {
	events.iter().find_map(|event| match event {
		AgentEvent::TurnEnded { ended } => Some((ended.outcome, ended.failure)),
		_ => None,
	})
}

fn is_turn_activity(frame: &Frame) -> bool {
	matches!(frame, Frame::StreamEvent(_) | Frame::Assistant(_) | Frame::ControlRequest(_))
}

fn starts_a_reply(frame: &Frame) -> bool {
	matches!(
		frame,
		Frame::Assistant(_)
			| Frame::StreamEvent(StreamEventFrame {
				event: Some(StreamEvent::MessageStart { .. }),
				..
			})
	)
}

fn crashed(closed: &ClosedFrame) -> TransportError {
	TransportError::Crashed { code: None, detail: closed.detail.clone() }
}

struct HostDesk {
	sidecar: Arc<Sidecar>,
	key: String,
	hosts: Vec<Arc<dyn HostRequests>>,
	strands: Option<Arc<dyn StrandedTurns>>,
	sink: Arc<dyn EventSink>,
}

impl HostDesk {
	fn answer(&self, asked: HostRequestFrame) {
		let sidecar = self.sidecar.clone();
		let key = self.key.clone();
		let host = declaring(&self.hosts, &asked.request);
		let sink = self.sink.clone();
		tokio::spawn(async move {
			let answer = match host {
				Ok(host) => host.serve(asked.request).await,
				Err(refusal) => Err(refusal),
			};
			let command = protocol::host_response_command(&key, &asked.request_id, &answer);
			if let Err(error) = sidecar.send(command) {
				sink.emit(AgentEvent::Failed { error });
			}
		});
	}
}

fn declaring(
	hosts: &[Arc<dyn HostRequests>],
	request: &Value,
) -> Result<Arc<dyn HostRequests>, Value> {
	let subtype = request.get("subtype").and_then(Value::as_str).unwrap_or_default();
	hosts.iter().find(|host| host.subtype() == subtype).cloned().ok_or_else(|| unserved(subtype))
}

fn unserved(subtype: &str) -> Value {
	serde_json::json!({ "kind": "unservedSubtype", "subtype": subtype })
}

async fn read_loop(
	mut frames: mpsc::UnboundedReceiver<Value>,
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	opened_tx: oneshot::Sender<Result<(), TransportError>>,
	mut desk: HostDesk,
	rearmed: Arc<Notify>,
) {
	let mut opened_tx = Some(opened_tx);
	let mut seen: u64 = 0;

	loop {
		let next = tokio::select! {
			biased;
			received = frames.recv() => received.map_or(Next::Ended, Next::Frame),
			() = lease_lapsed(&shared, &rearmed) => Next::Lapsed,
		};
		let raw = match next {
			Next::Frame(raw) => raw,
			Next::Ended => break,
			Next::Lapsed => {
				let lapsed = end_lapsed_turn(&shared, sink.as_ref(), &mut desk, &rearmed).await;
				if let Some(reopened) = lapsed {
					frames = reopened;
				}
				continue;
			}
		};
		seen += 1;
		shared.lock().await.heard();
		let Ok(frame) = serde_json::from_value::<Frame>(raw) else {
			sink.emit(AgentEvent::Failed {
				error: TransportError::InvalidFrame {
					detail: format!("unreadable frame {seen} of this session"),
				},
			});
			continue;
		};

		match &frame {
			Frame::Opened => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Ok(()));
				}
				continue;
			}
			Frame::Closed(closed) => {
				if let Some(tx) = opened_tx.take() {
					let _ = tx.send(Err(crashed(closed)));
					return;
				}
				on_exit(shared, sink, &desk.key, Some(crashed(closed))).await;
				return;
			}
			_ => {}
		}

		if let Frame::HostRequest(asked) = frame {
			desk.answer(asked);
			continue;
		}

		if let Frame::Heartbeat = frame {
			continue;
		}

		if let Frame::ProviderUnreachable = frame {
			shared.lock().await.provider_unreachable();
			rearmed.notify_one();
			continue;
		}

		if let Frame::TasksPending(pending) = frame {
			let held = {
				let mut guard = shared.lock().await;
				if guard.shutting_down {
					return;
				}
				guard.tasks_pending(pending.count)
			};
			for event in held {
				sink.emit(event);
			}
			continue;
		}

		{
			let mut guard = shared.lock().await;
			if guard.shutting_down {
				return;
			}
			if guard.settles_the_follow_up_alone(&frame) {
				guard.streams_a_follow_up = false;
				sink.follow_up(FollowUp::Settled(guard.translator.ingest(frame)));
				continue;
			}
			if let Some(step) = guard.follow_up_of(&frame) {
				sink.follow_up(step);
			}
			if matches!(frame, Frame::TurnSettled(_))
				&& std::mem::take(&mut guard.streams_a_follow_up)
			{
				sink.follow_up(FollowUp::FoldedIn);
			}
			if is_turn_activity(&frame) {
				guard.provider_reached();
			}
			let entering = match guard.turn {
				TurnState::Submitting if is_turn_activity(&frame) && !guard.streams_a_follow_up => {
					guard.set_turn(TurnState::Running)
				}
				_ => None,
			};
			let holds_a_result = matches!(frame, Frame::Result(_)) && !guard.streams_a_follow_up;
			if holds_a_result {
				guard.result_held();
			}
			let cause = FailureCause::told_by(&frame);
			let events = guard.translator.ingest(frame);
			let outcome = turn_ending(&events);
			let cause = cause.filter(|_| matches!(outcome, Some((TurnOutcome::Failed, _))));
			let released = outcome.and_then(|(outcome, failure)| {
				guard.turn_ended(&desk.key, outcome, failure, cause)
			});
			let ending = outcome.and_then(|(outcome, _)| guard.set_turn(outcome.into()));
			if holds_a_result {
				rearmed.notify_one();
			}
			for event in entering.into_iter().chain(released).chain(events).chain(ending) {
				sink.emit(event);
			}
			if outcome.is_some() {
				let line = Line { sidecar: &desk.sidecar, sink: sink.as_ref(), rearmed: &rearmed };
				line.deliver_next(&mut guard);
			}
		}
	}

	if let Some(tx) = opened_tx.take() {
		let _ = tx.send(Err(desk.sidecar.startup_crash()));
		return;
	}
	on_exit(shared, sink, &desk.key, None).await;
}

enum Next {
	Frame(Value),
	Ended,
	Lapsed,
}

async fn lease_lapsed(shared: &Mutex<Shared>, rearmed: &Notify) {
	loop {
		let deadline = shared.lock().await.lease_deadline();
		let Some((deadline, _)) = deadline else {
			rearmed.notified().await;
			continue;
		};
		tokio::select! {
			() = tokio::time::sleep_until(deadline) => return,
			() = rearmed.notified() => {}
		}
	}
}

async fn end_lapsed_turn(
	shared: &Mutex<Shared>,
	sink: &dyn EventSink,
	desk: &mut HostDesk,
	rearmed: &Notify,
) -> Option<mpsc::UnboundedReceiver<Value>> {
	let mut guard = shared.lock().await;
	let (deadline, expiry) = guard.lease_deadline()?;
	if guard.shutting_down || deadline > tokio::time::Instant::now() {
		return None;
	}
	let stranded = guard.stranded_by(expiry);
	for event in guard.end_lapsed(expiry) {
		sink.emit(event);
	}
	let (frames, reopened) = guard.reopen(&desk.sidecar);
	desk.key = guard.key.clone();
	match reopened {
		Ok(()) => Line { sidecar: &desk.sidecar, sink, rearmed }.deliver_next(&mut guard),
		Err(error) => {
			sink.emit(AgentEvent::Failed { error });
			guard.abandon_queued(TurnOutcome::Failed, Some(TurnFailure::AgentLost)).tell(sink);
		}
	}
	drop(guard);
	if let (Some(strands), Some(stranded)) = (&desk.strands, stranded) {
		strands.keep(stranded).await;
	}
	Some(frames)
}

async fn on_exit(
	shared: Arc<Mutex<Shared>>,
	sink: Arc<dyn EventSink>,
	session: &str,
	reason: Option<TransportError>,
) {
	let (released, failing, abandoned) = {
		let mut guard = shared.lock().await;
		if guard.shutting_down {
			return;
		}
		(
			guard.turn_ended(
				session,
				TurnOutcome::Failed,
				Some(TurnFailure::AgentLost),
				Some(FailureCause::closed_by(reason.as_ref())),
			),
			guard.set_turn(TurnState::Failed),
			guard.abandon_queued(TurnOutcome::Failed, Some(TurnFailure::AgentLost)),
		)
	};

	if let Some(event) = released {
		sink.emit(event);
	}
	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Crashed });
	sink.emit(AgentEvent::Failed {
		error: reason.unwrap_or(TransportError::Crashed {
			code: None,
			detail: Some("the agent exited unexpectedly".into()),
		}),
	});
	if let Some(event) = failing {
		sink.emit(event);
	}
	abandoned.tell(sink.as_ref());
}

#[cfg(test)]
mod tests {
	use super::super::sidecar::SidecarOptions;
	use super::*;

	#[derive(Debug)]
	struct StubHost {
		subtype: &'static str,
	}

	impl HostRequests for StubHost {
		fn subtype(&self) -> &'static str {
			self.subtype
		}

		fn serve(&self, request: Value) -> Answering {
			Box::pin(async move { Ok(request) })
		}
	}

	fn options() -> SessionOptions {
		SessionOptions::new(PathBuf::from("/tmp"))
	}

	fn mounted() -> Vec<Arc<dyn HostRequests>> {
		options()
			.hosting(Arc::new(StubHost { subtype: "routine" }))
			.hosting(Arc::new(StubHost { subtype: "mission" }))
			.hosts
	}

	#[test]
	fn a_request_is_carried_to_the_host_that_declares_the_subtype_it_names() {
		let hosts = mounted();

		for subtype in ["routine", "mission"] {
			let chosen = declaring(&hosts, &serde_json::json!({ "subtype": subtype }))
				.expect("a host declares it");

			assert_eq!(chosen.subtype(), subtype);
		}
	}

	#[test]
	fn a_subtype_no_mounted_host_declares_is_refused_by_name() {
		let refused = declaring(&mounted(), &serde_json::json!({ "subtype": "ledger" }))
			.expect_err("no host declares it");

		assert_eq!(refused, serde_json::json!({ "kind": "unservedSubtype", "subtype": "ledger" }));
	}

	#[test]
	fn a_bot_opens_on_the_bundle_it_runs_as() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.space_plugin_path.as_deref(), Some("/spaces/s1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
		assert_eq!(request.identity.as_deref(), Some("You are Bean, the baker."));
	}

	#[test]
	fn a_run_carries_the_directory_the_host_keeps_its_own_data_in() {
		let request =
			options().with_app_data(Some(PathBuf::from("/app-data/kiroshi"))).open_request(true);

		assert_eq!(request.app_data_dir.as_deref(), Some("/app-data/kiroshi"));
		assert_eq!(options().open_request(true).app_data_dir, None);
	}

	#[test]
	fn a_run_carries_the_conversation_it_answers_in() {
		let request = options().in_conversation("c1").open_request(true);

		assert_eq!(request.conversation_id.as_deref(), Some("c1"));
		assert_eq!(options().open_request(true).conversation_id, None);
	}

	#[test]
	fn only_a_mission_thread_run_names_its_thread() {
		let serialized = |options: SessionOptions| {
			serde_json::to_value(options.open_request(true)).expect("the request serializes")
		};

		assert_eq!(serialized(options().on_mission_thread(true))["missionThread"], true);
		assert_eq!(serialized(options().on_mission_thread(false)).get("missionThread"), None);
		assert_eq!(serialized(options()).get("missionThread"), None);
	}

	#[test]
	fn a_run_names_the_members_reading_it_only_when_there_are_some() {
		let serialized = |options: SessionOptions| {
			serde_json::to_value(options.open_request(true)).expect("the request serializes")
		};
		let members = vec![
			SpaceMember {
				name: Some("Ada".to_owned()),
				email: "ada@example.com".to_owned(),
				is_host: true,
			},
			SpaceMember { name: None, email: "bea@example.com".to_owned(), is_host: false },
		];

		assert_eq!(
			serialized(options().read_by(members))["members"],
			serde_json::json!([
				{ "name": "Ada", "email": "ada@example.com", "isHost": true },
				{ "email": "bea@example.com", "isHost": false },
			])
		);
		assert_eq!(serialized(options()).get("members"), None);
	}

	#[test]
	fn a_run_carries_the_tools_it_denies_and_the_mode_it_opens_under() {
		let serialized = |options: SessionOptions| {
			serde_json::to_value(options.open_request(true)).expect("the request serializes")
		};
		let narrowed = options()
			.denying(vec!["AskUserQuestion".to_owned()])
			.under_mode(Some("dontAsk".to_owned()));

		assert_eq!(
			serialized(narrowed.clone())["deniedTools"],
			serde_json::json!(["AskUserQuestion"])
		);
		assert_eq!(serialized(narrowed)["permissionMode"], "dontAsk");
	}

	#[test]
	fn a_run_carrying_neither_sends_neither() {
		let request =
			serde_json::to_value(options().denying(Vec::new()).under_mode(None).open_request(true))
				.expect("the request serializes");

		assert_eq!(request.get("deniedTools"), None);
		assert_eq!(request.get("permissionMode"), None);
	}

	#[test]
	fn a_resumed_run_carries_the_bundle_again() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "Concise".to_owned(),
			settings_path: None,
		};
		let request =
			options().bundled(Some(bundle)).resuming(Some("s1".to_owned())).open_request(true);

		assert_eq!(request.resume.as_deref(), Some("s1"));
		assert_eq!(request.plugin_path.as_deref(), Some("/bots/b1"));
		assert_eq!(request.agent.as_deref(), Some("bean"));
	}

	#[test]
	fn a_bot_opens_on_the_style_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: Some("/system/kiroshi".to_owned()),
			user_path: Some("/user/me".to_owned()),
			space_path: Some("/spaces/s1".to_owned()),
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: None,
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.output_style.as_deref(), Some("default"));
	}

	#[test]
	fn a_bot_opens_on_the_settings_file_its_bundle_carries() {
		let bundle = Bundle {
			path: "/bots/b1".to_owned(),
			system_path: None,
			user_path: None,
			space_path: None,
			agent: "bean".to_owned(),
			identity: "You are Bean, the baker.".to_owned(),
			output_style: "default".to_owned(),
			settings_path: Some("/bots/b1/settings.json".to_owned()),
		};
		let request = options().bundled(Some(bundle)).open_request(true);

		assert_eq!(request.settings_path.as_deref(), Some("/bots/b1/settings.json"));
	}

	#[test]
	fn a_bot_carrying_no_bundle_names_none() {
		let plain = options().bundled(None).open_request(true);

		assert_eq!(plain.plugin_path, None);
		assert_eq!(plain.space_plugin_path, None);
		assert_eq!(plain.agent, None);
		assert_eq!(plain.identity, None);
		assert_eq!(plain.output_style, None);
		assert_eq!(plain.settings_path, None);
	}

	#[test]
	fn a_run_carries_the_environment_read_when_it_opened() {
		let resolved = ResolvedEnv {
			base: [("TOKEN".to_owned(), "held".to_owned())].into(),
			per_server: [("clock".to_owned(), [("TOKEN".to_owned(), "narrow".to_owned())].into())]
				.into(),
			..ResolvedEnv::default()
		};
		let request = options().serving(resolved.clone()).open_request(true);

		assert_eq!(request.server_env, resolved);
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["serverEnv"],
			serde_json::json!({
				"base": { "TOKEN": "held" },
				"perServer": { "clock": { "TOKEN": "narrow" } }
			})
		);
	}

	#[test]
	fn a_run_serves_neither_connection_name_and_carries_the_held_source_alone() {
		use crate::db::connection::fixture_root;
		use crate::environment::connection;
		use crate::environment::contract::{
			ConnectionKind, EnvOwner, EnvScope, API_KEY, CONNECTION_NAMES, SUBSCRIPTION_TOKEN,
		};
		use crate::environment::store;

		let root = fixture_root("session-connection");
		let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let space = EnvScope::Space { id: "s1".to_owned() };
		let server = EnvScope::Server { name: "clock".to_owned(), owner: owner.clone() };
		store::set(&root, &space, API_KEY, "from-the-space").expect("the space keeps it");
		store::set(&root, &EnvScope::from(&owner), SUBSCRIPTION_TOKEN, "from-the-bot")
			.expect("the bot keeps it");
		store::set(&root, &server, API_KEY, "from-the-server").expect("the server keeps it");
		store::set(&root, &server, "TOKEN", "clock").expect("the server keeps it");
		connection::hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is held");

		let request = options()
			.serving(store::resolve(&root, &owner).expect("the store reads"))
			.connected(connection::held(&root).expect("the store reads"))
			.open_request(true);

		for name in CONNECTION_NAMES {
			assert_eq!(request.server_env.base.get(name), None, "{name} reached the base");
			assert!(
				request.server_env.per_server.values().all(|own| !own.contains_key(name)),
				"{name} reached an overlay"
			);
		}
		assert_eq!(request.server_env.per_server["clock"]["TOKEN"], "clock");
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["connection"],
			serde_json::json!({ "ANTHROPIC_API_KEY": "sk-held" })
		);
	}

	#[test]
	fn a_run_opened_with_no_source_held_leaves_the_connection_field_out() {
		let request = options().open_request(true);

		assert!(request.connection.is_empty());
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("connection"),
			None
		);
	}

	#[test]
	fn a_run_opened_with_no_environment_leaves_the_field_out() {
		let request = options().open_request(true);

		assert!(request.server_env.is_untouched());
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("serverEnv"),
			None
		);
	}

	#[test]
	fn a_run_whose_environment_could_not_be_read_carries_the_failure() {
		let request = options().serving(ResolvedEnv::failed("unreadable")).open_request(true);

		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["serverEnv"],
			serde_json::json!({ "base": {}, "perServer": {}, "failure": "unreadable" })
		);
	}

	#[test]
	fn a_run_asked_for_a_structured_answer_carries_the_schema_it_was_given_and_nothing_else() {
		let schema = serde_json::json!({
			"type": "object",
			"properties": { "outcome": { "enum": ["ok", "nothing"] } },
			"required": ["outcome"]
		});
		let request = options().answering(Some(schema.clone())).open_request(true);

		assert_eq!(request.output_schema.as_ref(), Some(&schema));
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes")["outputSchema"],
			schema
		);
	}

	#[test]
	fn a_run_asked_for_no_structured_answer_leaves_the_field_out() {
		let request = options().open_request(true);

		assert_eq!(request.output_schema, None);
		assert_eq!(
			serde_json::to_value(&request).expect("the request serializes").get("outputSchema"),
			None
		);
	}

	#[test]
	fn a_sidecar_that_names_no_deltas_is_asked_for_whole_messages() {
		assert!(!options().open_request(false).partial_messages);
		assert!(options().open_request(true).partial_messages);
	}

	fn a_running_turn() -> Shared {
		let mut shared = Shared {
			key: "s1".to_owned(),
			reopening: options().open_request(false),
			translator: Translator::new(false),
			turn: TurnState::Running,
			shutting_down: false,
			running: None,
			queued: VecDeque::new(),
			lease: RunLease::default(),
			streams_a_follow_up: false,
		};
		shared.turn_started("s1", Some("t1".to_owned()), "p1".to_owned(), TurnOrigin::Answered);
		shared
	}

	fn held(count: u32) -> AgentEvent {
		AgentEvent::TurnHeld {
			hold: Some(TurnHold { reason: TurnHoldReason::BackgroundTasks, count }),
		}
	}

	const RELEASED: AgentEvent = AgentEvent::TurnHeld { hold: None };

	fn holds_in(events: Vec<AgentEvent>) -> Vec<AgentEvent> {
		events.into_iter().filter(|event| matches!(event, AgentEvent::TurnHeld { .. })).collect()
	}

	#[test]
	fn a_hold_is_told_once_per_count_change_and_released_at_zero() {
		let mut shared = a_running_turn();

		let told: Vec<AgentEvent> =
			[2, 2, 1, 0, 0].into_iter().flat_map(|count| shared.tasks_pending(count)).collect();

		assert_eq!(holds_in(told), vec![held(2), held(1), RELEASED]);
	}

	#[test]
	fn a_hold_travels_as_its_reason_and_count_and_a_release_as_null() {
		assert_eq!(
			serde_json::to_value(held(3)).expect("a hold serializes"),
			serde_json::json!({ "type": "turnHeld", "hold": { "reason": "backgroundTasks", "count": 3 } })
		);
		assert_eq!(
			serde_json::to_value(RELEASED).expect("a release serializes"),
			serde_json::json!({ "type": "turnHeld", "hold": null })
		);
	}

	#[test]
	fn a_turn_ending_while_held_releases_its_hold_and_an_unheld_one_releases_nothing() {
		let mut held_turn = a_running_turn();
		held_turn.tasks_pending(1);
		assert_eq!(held_turn.turn_ended("s1", TurnOutcome::Completed, None, None), Some(RELEASED));

		let mut unheld_turn = a_running_turn();
		assert!(holds_in(unheld_turn.tasks_pending(0)).is_empty());
		assert_eq!(unheld_turn.turn_ended("s1", TurnOutcome::Completed, None, None), None);
	}

	#[tokio::test]
	async fn a_turn_failed_by_an_error_result_logs_the_subtype_and_text_it_carries() {
		crate::test_log::capturing();
		let frame: Frame = serde_json::from_value(serde_json::json!({
			"type": "result",
			"subtype": "error_during_execution",
			"is_error": true,
			"errors": ["the build ran out of memory", "the shell was killed"]
		}))
		.expect("a result frame");

		let released = a_running_turn().turn_ended(
			"s-error-result",
			TurnOutcome::Failed,
			Some(TurnFailure::ProviderError),
			FailureCause::told_by(&frame),
		);

		let logged = crate::test_log::infos_naming("session=s-error-result").await;
		assert_eq!(released, None, "an unheld turn released a hold");
		assert!(logged[0].contains("outcome=Failed reason=ProviderError took_ms="), "{logged:?}");
		assert!(
			logged[0].ends_with(
				r#"cause=error result subtype=Some("error_during_execution") text=Some("the build ran out of memory; the shell was killed")"#
			),
			"{logged:?}"
		);
	}

	#[tokio::test]
	async fn a_turn_failed_by_a_session_the_sidecar_closed_logs_the_reason_it_reports() {
		crate::test_log::capturing();
		let (sink, _heard) = mpsc::unbounded_channel::<AgentEvent>();
		let closed = TransportError::Crashed {
			code: None,
			detail: Some("Claude Code process exited with code 137".to_owned()),
		};

		on_exit(Arc::new(Mutex::new(a_running_turn())), Arc::new(sink), "s-closed", Some(closed))
			.await;

		let logged = crate::test_log::infos_naming("session=s-closed").await;
		assert!(
			logged[0].ends_with(
				r#"cause=session closed reason="Claude Code process exited with code 137""#
			),
			"{logged:?}"
		);
	}

	#[test]
	fn a_turn_lapsing_while_held_releases_its_hold_before_the_failure() {
		let mut shared = a_running_turn();
		shared.tasks_pending(1);

		let events = shared.end_lapsed(Expiry::Lapsed(Lapse::TasksPending));

		assert_eq!(events.first(), Some(&RELEASED));
		assert!(matches!(events.last(), Some(AgentEvent::Failed { .. })));
	}

	#[test]
	fn a_lapsed_turn_fails_for_its_lapse_and_names_the_lapse_in_a_failure() {
		let mut shared = a_running_turn();

		let events = shared.end_lapsed(Expiry::Lapsed(Lapse::Silent));

		assert_eq!(turn_ending(&events), Some((TurnOutcome::Failed, Some(TurnFailure::RunLapsed))));
		assert!(events.iter().any(|event| matches!(
			event,
			AgentEvent::Failed { error: TransportError::RunLapsed { lapse: Lapse::Silent, .. } }
		)));
	}

	#[test]
	fn a_turn_whose_provider_stays_unreachable_fails_for_no_connection_alone() {
		let mut shared = a_running_turn();

		let events = shared.end_lapsed(Expiry::ProviderUnreachable);

		assert_eq!(
			turn_ending(&events),
			Some((TurnOutcome::Failed, Some(TurnFailure::NoConnection)))
		);
		assert!(
			!events.iter().any(|event| matches!(event, AgentEvent::Failed { .. })),
			"a lost connection is told by the turn's reason, not a transport failure: {events:?}"
		);
	}

	const UNREACHABLE_SIDECAR: &str = r#"#!/bin/sh
printf '%s\n' '{"type":"ready","provider":"stub","version":"0"}'
while IFS= read -r line; do
	key=$(printf '%s' "$line" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
	case "$line" in
	*'"type":"open"'*)
		printf '{"session":"%s","frame":{"type":"opened"}}\n' "$key"
		;;
	*'"type":"prompt"'*)
		(
			i=0
			while [ $i -lt 40 ]; do
				printf '{"session":"%s","frame":{"type":"provider_unreachable"}}\n' "$key"
				i=$((i + 1))
				sleep 0.05
			done
		) &
		;;
	esac
done
"#;

	const ERRING_SIDECAR: &str = r#"#!/bin/sh
printf '%s\n' '{"type":"ready","provider":"stub","version":"0"}'
while IFS= read -r line; do
	key=$(printf '%s' "$line" | sed -n 's/.*"session":"\([^"]*\)".*/\1/p')
	case "$line" in
	*'"type":"open"'*)
		printf '{"session":"%s","frame":{"type":"opened"}}\n' "$key"
		;;
	*'"type":"prompt"'*)
		printf '{"session":"%s","frame":{"type":"turn_settled","subtype":"error_during_execution","is_error":true}}\n' "$key"
		;;
	esac
done
"#;

	const CONNECTION_BOUND: Duration = Duration::from_millis(300);

	#[derive(Default)]
	struct Heard(std::sync::Mutex<Vec<AgentEvent>>);

	impl Heard {
		fn ending(&self) -> Option<(TurnOutcome, Option<TurnFailure>)> {
			turn_ending(&self.0.lock().expect("the heard events lock"))
		}
	}

	impl EventSink for Heard {
		fn emit(&self, event: AgentEvent) {
			self.0.lock().expect("the heard events lock").push(event);
		}
	}

	#[derive(Debug, Default)]
	struct Kept(std::sync::Mutex<Vec<StrandedTurn>>);

	impl Kept {
		fn turns(&self) -> Vec<StrandedTurn> {
			self.0.lock().expect("the kept turns lock").clone()
		}
	}

	impl StrandedTurns for Kept {
		fn keep(&self, stranded: StrandedTurn) -> Keeping {
			self.0.lock().expect("the kept turns lock").push(stranded);
			Box::pin(std::future::ready(()))
		}
	}

	struct Stubbed {
		session: Session,
		heard: Arc<Heard>,
		kept: Arc<Kept>,
		_script: crate::removed_on_drop::RemovedOnDrop,
	}

	impl Stubbed {
		async fn ended(&self) -> Option<(TurnOutcome, Option<TurnFailure>)> {
			tokio::time::timeout(Duration::from_secs(5), async {
				while self.heard.ending().is_none() {
					tokio::time::sleep(Duration::from_millis(20)).await;
				}
			})
			.await
			.expect("the turn ended");
			tokio::time::sleep(Duration::from_millis(50)).await;
			self.heard.ending()
		}
	}

	async fn a_session_on(sidecar_script: &str) -> Stubbed {
		let script = crate::removed_on_drop::RemovedOnDrop(std::env::temp_dir().join(format!(
			"kiroshi-stranding-sidecar-{}-{}.sh",
			std::process::id(),
			uuid::Uuid::new_v4()
		)));
		crate::executable_script::an_executable_script(&script, sidecar_script);
		let sidecar = Sidecar::start(SidecarOptions::new(script.to_path_buf()))
			.await
			.expect("the sidecar is ready");
		let lease = RunLease { provider_unreachable: CONNECTION_BOUND, ..RunLease::default() };
		let heard = Arc::new(Heard::default());
		let kept = Arc::new(Kept::default());
		let options =
			SessionOptions::new(std::env::temp_dir()).leased(lease).stranding(kept.clone());
		let session =
			Session::start(sidecar, options, heard.clone()).await.expect("the session opens");
		Stubbed { session, heard, kept, _script: script }
	}

	fn handed(turn_id: &str) -> SubmittedTurn {
		SubmittedTurn { turn_id: turn_id.to_owned(), prompt_id: format!("prompt-of-{turn_id}") }
	}

	#[tokio::test]
	async fn a_turn_whose_provider_stays_unreachable_ends_at_the_connection_bound_and_is_kept_for_a_replay(
	) {
		let stubbed = a_session_on(UNREACHABLE_SIDECAR).await;
		let prompted_at = Instant::now();

		stubbed
			.session
			.submit("are you there", Some(handed("t1")))
			.await
			.expect("the prompt is written");
		let ended = stubbed.ended().await;

		assert_eq!(ended, Some((TurnOutcome::Failed, Some(TurnFailure::NoConnection))));
		assert!(
			prompted_at.elapsed() < CONNECTION_BOUND + Duration::from_secs(1),
			"the turn outlived its connection bound: {:?}",
			prompted_at.elapsed()
		);
		assert_eq!(
			stubbed.kept.turns(),
			vec![StrandedTurn {
				turn_id: "t1".to_owned(),
				handed: Some(handed("t1")),
				prompt: "are you there".to_owned(),
				sdk_session_id: None,
			}]
		);
	}

	#[tokio::test]
	async fn a_turn_handed_no_turn_id_is_kept_under_the_id_of_its_prompt() {
		let stubbed = a_session_on(UNREACHABLE_SIDECAR).await;

		stubbed.session.submit_prompt("are you there").await.expect("the prompt is written");
		stubbed.ended().await;

		let kept = stubbed.kept.turns();
		assert_eq!(kept.len(), 1, "{kept:?}");
		assert!(kept[0].handed.is_none());
		assert!(uuid::Uuid::parse_str(&kept[0].turn_id).is_ok(), "{kept:?}");
	}

	#[tokio::test]
	async fn a_turn_failing_for_a_provider_error_is_not_kept_for_a_replay() {
		let stubbed = a_session_on(ERRING_SIDECAR).await;

		stubbed.session.submit("are you there", Some(handed("t1"))).await.expect("written");

		assert_eq!(
			stubbed.ended().await,
			Some((TurnOutcome::Failed, Some(TurnFailure::ProviderError)))
		);
		assert_eq!(stubbed.kept.turns(), Vec::new());
	}

	#[tokio::test]
	async fn a_replayed_turn_that_loses_the_provider_again_is_not_kept_again() {
		crate::test_log::capturing();
		let stubbed = a_session_on(UNREACHABLE_SIDECAR).await;
		let stranded = StrandedTurn {
			turn_id: "t-replayed-again".to_owned(),
			handed: Some(handed("t-replayed-again")),
			prompt: "are you there".to_owned(),
			sdk_session_id: Some("sdk-1".to_owned()),
		};

		stubbed.session.replay(stranded).await.expect("the replay is written");

		assert_eq!(
			stubbed.ended().await,
			Some((TurnOutcome::Failed, Some(TurnFailure::NoConnection)))
		);
		assert_eq!(stubbed.kept.turns(), Vec::new());
		let logged = crate::test_log::infos_naming("original=t-replayed-again").await;
		assert_eq!(logged.len(), 1, "{logged:?}");
		assert!(
			logged[0].contains(
				"outcome=Failed reason=NoConnection replay=true original=t-replayed-again"
			),
			"{logged:?}"
		);
	}

	#[tokio::test]
	async fn a_replay_refuses_a_session_whose_turn_still_runs() {
		let stubbed = a_session_on(UNREACHABLE_SIDECAR).await;
		stubbed.session.submit("first", Some(handed("t0"))).await.expect("written");
		let stranded = StrandedTurn {
			turn_id: "t1".to_owned(),
			handed: Some(handed("t1")),
			prompt: "are you there".to_owned(),
			sdk_session_id: None,
		};

		let replayed = stubbed.session.replay(stranded).await;

		assert_eq!(replayed, Err(TransportError::TurnAlreadyRunning));
	}

	#[test]
	fn a_shutdown_while_held_releases_the_hold_before_the_turn_ends() {
		let mut shared = a_running_turn();
		shared.tasks_pending(1);

		let events = shared.ended_by_shutdown("s1");

		assert_eq!(events.first(), Some(&RELEASED));
		assert!(matches!(events.get(1), Some(AgentEvent::TurnEnded { .. })));
	}
}
