use rusqlite::Connection;

use super::connection::DatabaseError;

struct Migration {
	version: u32,
	statements: &'static str,
}

const MIGRATIONS: &[Migration] = &[
	Migration { version: 1, statements: CONVERSATIONS_SCHEMA },
	Migration { version: 2, statements: BOT_CONTEXT },
	Migration { version: 3, statements: BOT_IDENTITY },
	Migration { version: 4, statements: BOT_BLOT },
	Migration { version: 5, statements: BOT_COMMANDS },
	Migration { version: 6, statements: BOT_DENIAL },
	Migration { version: 7, statements: BOT_COLOUR },
	Migration { version: 8, statements: BOT_DENIED_TOOLS },
	Migration { version: 9, statements: MESSAGE_RUNTIME_SESSION },
	Migration { version: 10, statements: MESSAGE_PIN },
	Migration { version: 11, statements: BUBBLE_PIN },
	Migration { version: 12, statements: BOT_SPACE },
	Migration { version: 13, statements: BOT_SECTION },
	Migration { version: 14, statements: CONVERSATION_ROOM },
	Migration { version: 15, statements: BOT_PERMISSIONS },
	Migration { version: 17, statements: ROSTER_PIN },
	Migration { version: 18, statements: OPTIONAL_SPACE_COLOUR },
	Migration { version: 19, statements: SPACE_SETTINGS },
	Migration { version: 20, statements: SEVERAL_LIVE_SESSIONS },
	Migration { version: 21, statements: CHECKPOINT_PER_SESSION },
	Migration { version: 22, statements: ROUTINES },
	Migration { version: 23, statements: ROUTINE_TASK },
	Migration { version: 24, statements: ROUTINE_LAST_OCCURRENCE },
	Migration { version: 25, statements: ROUTINE_REPORTED_TURN },
	Migration { version: 26, statements: MISSIONS },
	Migration { version: 27, statements: MISSION_WATCH },
	Migration { version: 28, statements: MISSION_REPORT },
	Migration { version: 29, statements: MESSAGE_SEARCH },
	Migration { version: 30, statements: BOT_SPACES },
	Migration { version: 31, statements: SOLO_THREAD_PER_SPACE },
	Migration { version: 32, statements: MISSION_CHECKS_FAILED },
	Migration { version: 33, statements: CONVERSATION_ARRIVALS },
	Migration { version: 34, statements: APPLICATION_INSTALLS },
	Migration { version: 35, statements: APPLICATION_INSTALL_PRESENTATION },
	Migration { version: 36, statements: BOTS_WITHOUT_UNREAD_COLUMNS },
	Migration { version: 37, statements: MISSION_AGENT_LIVENESS },
	Migration { version: 38, statements: MISSION_STATUS },
	Migration { version: 39, statements: MISSION_PROGRESS },
	Migration { version: 40, statements: BOTS_WITHOUT_DEFAULT_MODEL },
	Migration { version: 41, statements: BOTS_WITHOUT_WORKING_DIR },
	Migration { version: 42, statements: MISSION_REOPENED },
	Migration { version: 43, statements: MISSION_DISMISSED },
	Migration { version: 44, statements: BOTS_WITHOUT_ANIMAL },
	Migration { version: 45, statements: BOT_EFFORT },
	Migration { version: 46, statements: SPACE_HOSTING },
	Migration { version: 47, statements: MESSAGE_ACCOUNT_AUTHOR },
	Migration { version: 48, statements: SPACE_MEMBER_ROLES },
	Migration { version: 49, statements: SPACE_MEMBER_ROLES_DROPPED },
	Migration { version: 50, statements: CONVERSATION_ACTIVITY },
	Migration { version: 51, statements: SOLO_CONVERSATION_ACTIVITY },
	Migration { version: 52, statements: TURN_RUNS },
	Migration { version: 53, statements: CONVERSATION_LOOK },
];

const CONVERSATIONS_SCHEMA: &str = "
CREATE TABLE bots (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	model TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE conversations (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('main', 'topic')),
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	archived_at INTEGER
);

CREATE TABLE conversation_participants (
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
	role TEXT NOT NULL,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (conversation_id, bot_id)
);

CREATE TABLE runtime_sessions (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	provider_session_id TEXT,
	seq INTEGER NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'ended', 'failed')),
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	rotation_reason TEXT,
	UNIQUE (conversation_id, bot_id, seq),
	UNIQUE (id, conversation_id, bot_id),
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX runtime_sessions_active_per_participant
	ON runtime_sessions (conversation_id, bot_id) WHERE status = 'active';

CREATE TABLE turns (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	UNIQUE (conversation_id, seq),
	UNIQUE (id, conversation_id)
);

CREATE TABLE messages (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	turn_id TEXT NOT NULL,
	author_bot_id TEXT,
	replied_to_message_id TEXT,
	seq INTEGER NOT NULL,
	role TEXT NOT NULL,
	content TEXT NOT NULL,
	completion_state TEXT NOT NULL CHECK (completion_state IN
		('pending', 'streaming', 'complete', 'cancelled', 'failed', 'interrupted')),
	created_at INTEGER NOT NULL,
	UNIQUE (conversation_id, seq),
	UNIQUE (id, conversation_id),
	FOREIGN KEY (turn_id, conversation_id)
		REFERENCES turns (id, conversation_id) ON DELETE CASCADE,
	FOREIGN KEY (replied_to_message_id, conversation_id)
		REFERENCES messages (id, conversation_id) ON DELETE CASCADE,
	FOREIGN KEY (conversation_id, author_bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id)
);

CREATE INDEX messages_by_turn ON messages(turn_id);

CREATE TABLE activities (
	id TEXT PRIMARY KEY,
	turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'terminated')),
	payload TEXT NOT NULL,
	seq INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (turn_id, seq)
);

CREATE INDEX activities_unfinished ON activities (status)
	WHERE status IN ('pending', 'running');

CREATE TABLE context_checkpoints (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	runtime_session_id TEXT,
	summary TEXT NOT NULL,
	last_message_seq INTEGER NOT NULL,
	token_count INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (conversation_id, bot_id, last_message_seq),
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE,
	FOREIGN KEY (runtime_session_id, conversation_id, bot_id)
		REFERENCES runtime_sessions (id, conversation_id, bot_id)
);

CREATE TRIGGER context_checkpoints_are_written_once
BEFORE UPDATE ON context_checkpoints
BEGIN
	SELECT RAISE(ABORT, 'a checkpoint records one moment: insert a new one, never edit this row');
END;

CREATE TABLE app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
";

const BOT_CONTEXT: &str = "
ALTER TABLE bots ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN memory TEXT NOT NULL DEFAULT '';
";

const BOT_IDENTITY: &str = "
ALTER TABLE bots ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN avatar_animal TEXT NOT NULL DEFAULT 'cat'
	CHECK (avatar_animal IN
		('cat', 'rabbit', 'bear', 'chick', 'dog', 'mouse', 'owl', 'koala'));
ALTER TABLE bots ADD COLUMN avatar_pose TEXT NOT NULL DEFAULT 'idle'
	CHECK (avatar_pose IN
		('idle', 'happy', 'curious', 'proud', 'shy', 'playful', 'bored', 'sleeping'));
ALTER TABLE bots ADD COLUMN avatar_image_path TEXT;
ALTER TABLE bots ADD COLUMN working_dir TEXT;
";

const BOT_BLOT: &str = "
ALTER TABLE bots ADD COLUMN avatar_blot TEXT
	CHECK (avatar_blot IN
		('coral', 'amber', 'moss', 'water', 'sky', 'lavender', 'rose', 'slate'));
";

const BOT_COMMANDS: &str = "
ALTER TABLE bots ADD COLUMN commands TEXT NOT NULL DEFAULT '[]';
";

const BOT_DENIAL: &str = "
ALTER TABLE bots ADD COLUMN changes_nothing INTEGER NOT NULL DEFAULT 0;
";

const BOT_COLOUR: &str = "
ALTER TABLE bots ADD COLUMN avatar_color TEXT
	CHECK (avatar_color IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange'));

UPDATE bots SET avatar_color = CASE avatar_blot
	WHEN 'coral' THEN 'red'
	WHEN 'amber' THEN 'yellow'
	WHEN 'moss' THEN 'green'
	WHEN 'water' THEN 'cyan'
	WHEN 'sky' THEN 'blue'
	WHEN 'lavender' THEN 'purple'
	WHEN 'rose' THEN 'pink'
	WHEN 'slate' THEN 'orange'
END;
";

const BOT_DENIED_TOOLS: &str = "
ALTER TABLE bots ADD COLUMN denied_tools TEXT NOT NULL DEFAULT '[]';
UPDATE bots SET denied_tools = '[\"Bash\",\"Edit\",\"NotebookEdit\",\"Write\"]'
	WHERE changes_nothing = 1;
ALTER TABLE bots DROP COLUMN changes_nothing;
";

const MESSAGE_RUNTIME_SESSION: &str = "
ALTER TABLE messages ADD COLUMN runtime_session_id TEXT REFERENCES runtime_sessions(id);
";

const MESSAGE_PIN: &str = "
ALTER TABLE messages ADD COLUMN pinned_at INTEGER;
CREATE INDEX messages_pinned ON messages (conversation_id, seq) WHERE pinned_at IS NOT NULL;
";

const BUBBLE_PIN: &str = "
CREATE TABLE message_pins (
	conversation_id TEXT NOT NULL,
	message_id TEXT NOT NULL,
	block_index INTEGER NOT NULL,
	pinned_at INTEGER NOT NULL,
	PRIMARY KEY (conversation_id, message_id, block_index),
	FOREIGN KEY (message_id, conversation_id)
		REFERENCES messages (id, conversation_id) ON DELETE CASCADE
);

INSERT INTO message_pins (conversation_id, message_id, block_index, pinned_at)
	SELECT conversation_id, id, 0, pinned_at FROM messages WHERE pinned_at IS NOT NULL;

DROP INDEX messages_pinned;
ALTER TABLE messages DROP COLUMN pinned_at;
";

const BOT_SPACE: &str = "
CREATE TABLE spaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	colour TEXT NOT NULL CHECK (colour IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

INSERT INTO spaces (id, name, colour, position, created_at)
	VALUES ('personal', 'Personal', 'red', 0, unixepoch() * 1000);

PRAGMA legacy_alter_table = ON;
ALTER TABLE bots RENAME TO bots_without_space;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE bots (
	id TEXT PRIMARY KEY,
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	model TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	instructions TEXT NOT NULL DEFAULT '',
	memory TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	avatar_animal TEXT NOT NULL DEFAULT 'cat'
		CHECK (avatar_animal IN
			('cat', 'rabbit', 'bear', 'chick', 'dog', 'mouse', 'owl', 'koala')),
	avatar_pose TEXT NOT NULL DEFAULT 'idle'
		CHECK (avatar_pose IN
			('idle', 'happy', 'curious', 'proud', 'shy', 'playful', 'bored', 'sleeping')),
	avatar_image_path TEXT,
	working_dir TEXT,
	avatar_blot TEXT
		CHECK (avatar_blot IN
			('coral', 'amber', 'moss', 'water', 'sky', 'lavender', 'rose', 'slate')),
	commands TEXT NOT NULL DEFAULT '[]',
	avatar_color TEXT
		CHECK (avatar_color IN
			('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	denied_tools TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO bots (id, space_id, name, model, created_at, instructions, memory, title,
		description, avatar_animal, avatar_pose, avatar_image_path, working_dir, avatar_blot,
		commands, avatar_color, denied_tools)
	SELECT id, 'personal', name, model, created_at, instructions, memory, title,
		description, avatar_animal, avatar_pose, avatar_image_path, working_dir, avatar_blot,
		commands, avatar_color, denied_tools
	FROM bots_without_space;

DROP TABLE bots_without_space;
";

const BOT_SECTION: &str = "
CREATE TABLE sections (
	id TEXT PRIMARY KEY,
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

ALTER TABLE bots ADD COLUMN section_id TEXT
	REFERENCES sections(id) ON DELETE SET NULL;
";

const BOT_PERMISSIONS: &str = "
ALTER TABLE bots ADD COLUMN permissions TEXT;
";

const ROSTER_PIN: &str = "
ALTER TABLE bots ADD COLUMN pin_position INTEGER;
ALTER TABLE conversations ADD COLUMN pin_position INTEGER;

UPDATE conversations SET pin_position = (
	SELECT COUNT(*) FROM conversations AS earlier
		WHERE earlier.section_id = conversations.section_id
			AND (earlier.created_at < conversations.created_at
				OR (earlier.created_at = conversations.created_at
					AND earlier.id < conversations.id))
) WHERE section_id IS NOT NULL;

UPDATE bots SET pin_position = (
	SELECT COUNT(*) FROM conversations WHERE conversations.section_id = bots.section_id
) + (
	SELECT COUNT(*) FROM bots AS earlier
		WHERE earlier.section_id = bots.section_id
			AND (earlier.created_at < bots.created_at
				OR (earlier.created_at = bots.created_at AND earlier.id < bots.id))
) WHERE section_id IS NOT NULL;
";

const CONVERSATION_ROOM: &str = "
ALTER TABLE conversations ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN section_id TEXT REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN instructions TEXT NOT NULL DEFAULT '';

UPDATE conversations SET space_id = (
	SELECT bots.space_id FROM conversation_participants
		JOIN bots ON bots.id = conversation_participants.bot_id
		WHERE conversation_participants.conversation_id = conversations.id
		ORDER BY conversation_participants.joined_at ASC, conversation_participants.bot_id ASC
		LIMIT 1
);

CREATE INDEX conversations_of_space ON conversations (space_id) WHERE kind = 'topic';

ALTER TABLE conversation_participants ADD COLUMN join_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_participants ADD COLUMN left_at INTEGER;

UPDATE conversation_participants SET join_seq = (
	SELECT COUNT(*) FROM conversation_participants AS earlier
		WHERE earlier.conversation_id = conversation_participants.conversation_id
			AND (earlier.joined_at < conversation_participants.joined_at
				OR (earlier.joined_at = conversation_participants.joined_at
					AND earlier.bot_id < conversation_participants.bot_id))
);

CREATE UNIQUE INDEX conversation_participants_in_join_order
	ON conversation_participants (conversation_id, join_seq);

CREATE UNIQUE INDEX conversation_participants_one_lead
	ON conversation_participants (conversation_id) WHERE role = 'lead';

ALTER TABLE bots ADD COLUMN deleted_at INTEGER;
";

const SPACE_SETTINGS: &str = "
CREATE TABLE IF NOT EXISTS space_settings (
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	key TEXT NOT NULL,
	value TEXT NOT NULL,
	PRIMARY KEY (space_id, key)
);
";

const OPTIONAL_SPACE_COLOUR: &str = "
PRAGMA legacy_alter_table = ON;
ALTER TABLE spaces RENAME TO spaces_always_coloured;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE spaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	colour TEXT CHECK (colour IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

INSERT INTO spaces (id, name, colour, position, created_at)
	SELECT id, name, colour, position, created_at FROM spaces_always_coloured;

DROP TABLE spaces_always_coloured;
";

const SEVERAL_LIVE_SESSIONS: &str = "
DROP INDEX IF EXISTS runtime_sessions_active_per_participant;
";

const CHECKPOINT_PER_SESSION: &str = "
DROP TRIGGER context_checkpoints_are_written_once;

PRAGMA legacy_alter_table = ON;
ALTER TABLE context_checkpoints RENAME TO context_checkpoints_shared_by_a_bot;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE context_checkpoints (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	runtime_session_id TEXT,
	summary TEXT NOT NULL,
	last_message_seq INTEGER NOT NULL,
	token_count INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE,
	FOREIGN KEY (runtime_session_id, conversation_id, bot_id)
		REFERENCES runtime_sessions (id, conversation_id, bot_id)
);

INSERT INTO context_checkpoints
	(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
		token_count, created_at)
	SELECT id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
		token_count, created_at
	FROM context_checkpoints_shared_by_a_bot;

DROP TABLE context_checkpoints_shared_by_a_bot;

CREATE UNIQUE INDEX context_checkpoints_per_session
	ON context_checkpoints (runtime_session_id, last_message_seq);

CREATE TRIGGER context_checkpoints_are_written_once
BEFORE UPDATE ON context_checkpoints
BEGIN
	SELECT RAISE(ABORT, 'a checkpoint records one moment: insert a new one, never edit this row');
END;
";

const ROUTINES: &str = "
CREATE TABLE IF NOT EXISTS routines (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	trigger_source_id TEXT NOT NULL,
	event_filter TEXT NOT NULL,
	trigger_config TEXT NOT NULL,
	trigger_key TEXT NOT NULL UNIQUE,
	is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
	consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
	last_failed_at INTEGER,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS routines_by_conversation ON routines (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS routine_runs (
	id TEXT PRIMARY KEY,
	routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	outcome TEXT CHECK (outcome IN ('ok', 'nothing', 'skipped', 'failed')),
	reason TEXT,
	cost_usd REAL,
	model_usage TEXT,
	lease_renewed_at INTEGER NOT NULL,
	CHECK ((ended_at IS NULL) = (outcome IS NULL))
);

CREATE INDEX IF NOT EXISTS routine_runs_by_routine ON routine_runs (routine_id, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS routine_runs_one_open_per_routine
	ON routine_runs (routine_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_dedupe_values (
	routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
	value TEXT NOT NULL,
	seen_at INTEGER NOT NULL,
	PRIMARY KEY (routine_id, value)
);

CREATE INDEX IF NOT EXISTS routine_dedupe_values_by_age ON routine_dedupe_values (seen_at);
";

const ROUTINE_TASK: &str = "
ALTER TABLE routines ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE routines ADD COLUMN instruction TEXT NOT NULL DEFAULT '';
";

const ROUTINE_LAST_OCCURRENCE: &str = "
ALTER TABLE routines ADD COLUMN last_occurrence_at INTEGER;
";

const ROUTINE_REPORTED_TURN: &str = "
ALTER TABLE routine_runs ADD COLUMN reported_turn_id TEXT
	REFERENCES turns (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS routine_runs_one_run_per_reported_turn
	ON routine_runs (reported_turn_id) WHERE reported_turn_id IS NOT NULL;
";

const MISSIONS: &str = "
PRAGMA legacy_alter_table = ON;
ALTER TABLE conversations RENAME TO conversations_without_missions;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE conversations (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('main', 'topic', 'mission')),
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	archived_at INTEGER,
	pin_position INTEGER,
	space_id TEXT REFERENCES spaces(id) ON DELETE CASCADE,
	section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
	instructions TEXT NOT NULL DEFAULT ''
);

INSERT INTO conversations (id, kind, title, created_at, updated_at, archived_at, pin_position,
		space_id, section_id, instructions)
	SELECT id, kind, title, created_at, updated_at, archived_at, pin_position,
		space_id, section_id, instructions
	FROM conversations_without_missions;

DROP TABLE conversations_without_missions;

CREATE INDEX conversations_of_space ON conversations (space_id) WHERE kind = 'topic';

CREATE TABLE missions (
	id TEXT PRIMARY KEY,
	origin_conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	thread_conversation_id TEXT NOT NULL UNIQUE
		REFERENCES conversations (id) ON DELETE CASCADE,
	objective TEXT NOT NULL,
	ticket_platform TEXT NOT NULL,
	ticket_external_id TEXT NOT NULL,
	ticket_url TEXT NOT NULL,
	ticket_title TEXT NOT NULL,
	tools TEXT NOT NULL DEFAULT '[]',
	opened_at INTEGER NOT NULL,
	closed_at INTEGER,
	FOREIGN KEY (origin_conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX missions_of_conversation ON missions (origin_conversation_id, opened_at, id);

CREATE INDEX missions_still_open ON missions (opened_at, id) WHERE closed_at IS NULL;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'answered', 'escalated', 'ready', 'failed', 'closed')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (mission_id, seq)
);

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const MISSION_WATCH: &str = "
ALTER TABLE missions ADD COLUMN watch_branch TEXT NOT NULL DEFAULT '';
ALTER TABLE missions ADD COLUMN watch_repository TEXT NOT NULL DEFAULT '';
ALTER TABLE missions ADD COLUMN watch_workspace_path TEXT;
ALTER TABLE missions ADD COLUMN delivery_key TEXT NOT NULL DEFAULT '';
ALTER TABLE missions ADD COLUMN github_fingerprint TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX missions_one_mission_per_delivery_key
	ON missions (delivery_key) WHERE delivery_key <> '';

CREATE INDEX missions_watched_on_github
	ON missions (watch_repository, watch_branch) WHERE closed_at IS NULL;

ALTER TABLE mission_events ADD COLUMN delivery_id TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';
";

const MISSION_REPORT: &str = "
ALTER TABLE missions ADD COLUMN reported_at INTEGER;
ALTER TABLE missions ADD COLUMN reported_turn_id TEXT
	REFERENCES turns (id) ON DELETE SET NULL;

UPDATE missions SET reported_at = closed_at WHERE closed_at IS NOT NULL;

CREATE INDEX missions_closed_without_report
	ON missions (closed_at, id) WHERE closed_at IS NOT NULL AND reported_at IS NULL;
";

const MESSAGE_SEARCH: &str = "
CREATE VIRTUAL TABLE message_search USING fts5(
	content,
	message_id UNINDEXED,
	conversation_id UNINDEXED,
	tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO message_search (content, message_id, conversation_id)
	SELECT content, id, conversation_id FROM messages
	WHERE completion_state NOT IN ('pending', 'streaming');

CREATE TRIGGER messages_settled_at_once_are_indexed
AFTER INSERT ON messages
WHEN NEW.completion_state NOT IN ('pending', 'streaming')
BEGIN
	INSERT INTO message_search (content, message_id, conversation_id)
		VALUES (NEW.content, NEW.id, NEW.conversation_id);
END;

CREATE TRIGGER messages_are_indexed_when_they_settle
AFTER UPDATE OF completion_state ON messages
WHEN OLD.completion_state IN ('pending', 'streaming')
	AND NEW.completion_state NOT IN ('pending', 'streaming')
BEGIN
	INSERT INTO message_search (content, message_id, conversation_id)
		VALUES (NEW.content, NEW.id, NEW.conversation_id);
END;

CREATE TRIGGER messages_leave_the_index_with_their_row
AFTER DELETE ON messages
BEGIN
	DELETE FROM message_search WHERE message_id = OLD.id;
END;

CREATE TRIGGER messages_leave_the_index_with_their_conversation
AFTER DELETE ON conversations
BEGIN
	DELETE FROM message_search WHERE conversation_id = OLD.id;
END;
";

const BOT_SPACES: &str = "
CREATE TABLE bot_spaces (
	bot_id TEXT NOT NULL REFERENCES bots (id) ON DELETE CASCADE,
	space_id TEXT NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
	section_id TEXT REFERENCES sections (id) ON DELETE SET NULL,
	pin_position INTEGER,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (bot_id, space_id)
);

CREATE INDEX bot_spaces_of_space ON bot_spaces (space_id);

INSERT INTO bot_spaces (bot_id, space_id, section_id, pin_position, joined_at)
	SELECT id, space_id, section_id, pin_position, created_at FROM bots;

ALTER TABLE bots DROP COLUMN space_id;
ALTER TABLE bots DROP COLUMN section_id;
ALTER TABLE bots DROP COLUMN pin_position;
";

const SOLO_THREAD_PER_SPACE: &str = "
UPDATE conversations SET space_id = (
	SELECT bot_spaces.space_id FROM conversation_participants
		JOIN bot_spaces ON bot_spaces.bot_id = conversation_participants.bot_id
		WHERE conversation_participants.conversation_id = conversations.id
		ORDER BY conversation_participants.join_seq ASC,
			bot_spaces.joined_at ASC, bot_spaces.space_id ASC
		LIMIT 1)
WHERE kind = 'main' AND space_id IS NULL;

CREATE INDEX conversation_participants_of_bot ON conversation_participants (bot_id);
";

const MISSION_CHECKS_FAILED: &str = "
DROP TRIGGER mission_events_are_written_once;
DROP TRIGGER mission_events_outlive_their_mission;

PRAGMA legacy_alter_table = ON;
ALTER TABLE mission_events RENAME TO mission_events_without_checks_failed;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'answered', 'escalated', 'ready', 'checks_failed',
			'failed', 'closed')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	UNIQUE (mission_id, seq)
);

INSERT INTO mission_events
		(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT id, mission_id, seq, kind, source, payload, created_at, delivery_id
	FROM mission_events_without_checks_failed;

DROP TABLE mission_events_without_checks_failed;

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const MISSION_AGENT_LIVENESS: &str = "
DROP TRIGGER mission_events_are_written_once;
DROP TRIGGER mission_events_outlive_their_mission;

PRAGMA legacy_alter_table = ON;
ALTER TABLE mission_events RENAME TO mission_events_without_agent_liveness;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'agent_started', 'agent_stopped', 'answered',
			'escalated', 'ready', 'checks_failed', 'failed', 'closed')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	UNIQUE (mission_id, seq)
);

INSERT INTO mission_events
		(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT id, mission_id, seq, kind, source, payload, created_at, delivery_id
	FROM mission_events_without_agent_liveness;

DROP TABLE mission_events_without_agent_liveness;

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const MISSION_STATUS: &str = "
DROP TRIGGER mission_events_are_written_once;
DROP TRIGGER mission_events_outlive_their_mission;

PRAGMA legacy_alter_table = ON;
ALTER TABLE mission_events RENAME TO mission_events_without_status;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'agent_started', 'agent_stopped', 'answered',
			'escalated', 'ready', 'checks_failed', 'failed', 'closed', 'status')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	UNIQUE (mission_id, seq)
);

INSERT INTO mission_events
		(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT id, mission_id, seq, kind, source, payload, created_at, delivery_id
	FROM mission_events_without_status;

DROP TABLE mission_events_without_status;

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const MISSION_PROGRESS: &str = "
ALTER TABLE missions ADD COLUMN last_activity_at INTEGER;
ALTER TABLE missions ADD COLUMN last_activity TEXT;
ALTER TABLE missions ADD COLUMN commits_ahead INTEGER;
ALTER TABLE missions ADD COLUMN dirty_files INTEGER;
ALTER TABLE missions ADD COLUMN pull_request_url TEXT;

UPDATE missions SET pull_request_url = (
	SELECT json_extract(payload, '$.url') FROM mission_events
	WHERE mission_events.mission_id = missions.id AND mission_events.source = 'github'
		AND mission_events.kind = 'note' AND json_extract(payload, '$.url') IS NOT NULL
	ORDER BY mission_events.seq DESC LIMIT 1
);
";

const BOTS_WITHOUT_DEFAULT_MODEL: &str = "
UPDATE bots SET model = 'opus' WHERE model = 'default';
";

const CONVERSATION_ARRIVALS: &str = "
CREATE TABLE conversation_arrivals (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
	bot_id TEXT NOT NULL,
	invited_by_bot_id TEXT,
	last_message_seq INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX conversation_arrivals_in_order
	ON conversation_arrivals (conversation_id, last_message_seq, created_at, id);
";

const APPLICATION_INSTALLS: &str = "
CREATE TABLE application_installs (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
	application TEXT NOT NULL,
	title TEXT NOT NULL,
	logo TEXT,
	scope TEXT NOT NULL CHECK (scope IN ('companion', 'space', 'user')),
	destination_id TEXT,
	install_kind TEXT NOT NULL CHECK (install_kind IN ('nothing', 'key', 'oauth')),
	secret_name TEXT,
	last_message_seq INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	CHECK (install_kind <> 'key' OR secret_name IS NOT NULL)
);

CREATE INDEX application_installs_in_order
	ON application_installs (conversation_id, created_at, id);
";

const APPLICATION_INSTALL_PRESENTATION: &str = "
ALTER TABLE application_installs ADD COLUMN logo_url TEXT;
ALTER TABLE application_installs ADD COLUMN description TEXT;
";

const BOTS_WITHOUT_UNREAD_COLUMNS: &str = "
PRAGMA legacy_alter_table = ON;
ALTER TABLE bots RENAME TO bots_with_unread_columns;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE bots (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	model TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	instructions TEXT NOT NULL DEFAULT '',
	memory TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	avatar_animal TEXT NOT NULL DEFAULT 'cat'
		CHECK (avatar_animal IN
			('cat', 'rabbit', 'bear', 'chick', 'dog', 'mouse', 'owl', 'koala')),
	avatar_image_path TEXT,
	working_dir TEXT,
	commands TEXT NOT NULL DEFAULT '[]',
	avatar_color TEXT
		CHECK (avatar_color IN
			('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	denied_tools TEXT NOT NULL DEFAULT '[]',
	permissions TEXT,
	deleted_at INTEGER
);

INSERT INTO bots (id, name, model, created_at, instructions, memory, title, avatar_animal,
		avatar_image_path, working_dir, commands, avatar_color, denied_tools, permissions,
		deleted_at)
	SELECT id, name, model, created_at, instructions, memory, title, avatar_animal,
		avatar_image_path, working_dir, commands, avatar_color, denied_tools, permissions,
		deleted_at
	FROM bots_with_unread_columns;

DROP TABLE bots_with_unread_columns;
";

const BOTS_WITHOUT_WORKING_DIR: &str = "
ALTER TABLE bots DROP COLUMN working_dir;
";

const MISSION_REOPENED: &str = "
DROP TRIGGER mission_events_are_written_once;
DROP TRIGGER mission_events_outlive_their_mission;

PRAGMA legacy_alter_table = ON;
ALTER TABLE mission_events RENAME TO mission_events_without_reopened;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'agent_started', 'agent_stopped', 'answered',
			'escalated', 'ready', 'checks_failed', 'failed', 'closed', 'status',
			'reopened')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	UNIQUE (mission_id, seq)
);

INSERT INTO mission_events
		(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT id, mission_id, seq, kind, source, payload, created_at, delivery_id
	FROM mission_events_without_reopened;

DROP TABLE mission_events_without_reopened;

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const MISSION_DISMISSED: &str = "
DROP TRIGGER mission_events_are_written_once;
DROP TRIGGER mission_events_outlive_their_mission;

PRAGMA legacy_alter_table = ON;
ALTER TABLE mission_events RENAME TO mission_events_without_dismissed;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE mission_events (
	id TEXT PRIMARY KEY,
	mission_id TEXT NOT NULL REFERENCES missions (id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN
		('opened', 'note', 'agent_asked', 'agent_started', 'agent_stopped', 'answered',
			'escalated', 'ready', 'checks_failed', 'failed', 'closed', 'status',
			'reopened', 'dismissed')),
	source TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	delivery_id TEXT NOT NULL DEFAULT '',
	UNIQUE (mission_id, seq)
);

INSERT INTO mission_events
		(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT id, mission_id, seq, kind, source, payload, created_at, delivery_id
	FROM mission_events_without_dismissed;

DROP TABLE mission_events_without_dismissed;

CREATE UNIQUE INDEX mission_events_one_event_per_delivery
	ON mission_events (mission_id, delivery_id) WHERE delivery_id <> '';

CREATE TRIGGER mission_events_are_written_once
BEFORE UPDATE ON mission_events
BEGIN
	SELECT RAISE(ABORT, 'a mission event records one moment: append a new one, never edit it');
END;

CREATE TRIGGER mission_events_outlive_their_mission
BEFORE DELETE ON mission_events
WHEN EXISTS (SELECT 1 FROM missions WHERE id = OLD.mission_id)
BEGIN
	SELECT RAISE(ABORT, 'a mission event is never erased while its mission stands');
END;
";

const BOTS_WITHOUT_ANIMAL: &str = "
ALTER TABLE bots DROP COLUMN avatar_animal;
";

const BOT_EFFORT: &str = "
ALTER TABLE bots ADD COLUMN effort TEXT
	CHECK (effort IN ('low', 'medium', 'high', 'xhigh', 'max'));
";

const SPACE_HOSTING: &str = "
CREATE TABLE space_hosting (
	space_id TEXT PRIMARY KEY REFERENCES spaces (id) ON DELETE CASCADE,
	instance_id TEXT UNIQUE,
	is_hosted INTEGER NOT NULL CHECK (is_hosted IN (0, 1))
);
";

const MESSAGE_ACCOUNT_AUTHOR: &str = "
ALTER TABLE messages ADD COLUMN author_account_id TEXT;
ALTER TABLE messages ADD COLUMN author_name TEXT;
";

const SPACE_MEMBER_ROLES: &str = "
CREATE TABLE space_member_roles (
	space_id TEXT NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('guest', 'member')),
	PRIMARY KEY (space_id, user_id)
);
";

const SPACE_MEMBER_ROLES_DROPPED: &str = "
DROP TABLE space_member_roles;
";

const CONVERSATION_ACTIVITY: &str = "
ALTER TABLE conversations ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0;

UPDATE conversations SET last_activity_at = COALESCE(
	(SELECT MAX(messages.created_at) FROM messages
		WHERE messages.conversation_id = conversations.id),
	created_at);

CREATE TRIGGER conversations_are_active_from_their_creation
AFTER INSERT ON conversations
WHEN NEW.last_activity_at < NEW.created_at
BEGIN
	UPDATE conversations SET last_activity_at = NEW.created_at WHERE id = NEW.id;
END;

CREATE TRIGGER messages_move_their_conversation_activity_forward
AFTER INSERT ON messages
BEGIN
	UPDATE conversations SET last_activity_at = NEW.created_at
		WHERE id = NEW.conversation_id AND last_activity_at < NEW.created_at;
END;

CREATE INDEX conversations_by_activity
	ON conversations (space_id, last_activity_at, id) WHERE kind = 'topic';

CREATE INDEX missions_by_opening ON missions (opened_at, id, closed_at);
";

const SOLO_CONVERSATION_ACTIVITY: &str = "
CREATE INDEX conversations_and_solos_by_activity
	ON conversations (space_id, last_activity_at, id) WHERE kind IN ('topic', 'main');

DROP INDEX conversations_by_activity;
";

const TURN_RUNS: &str = "
CREATE TABLE turn_runs (
	turn_id TEXT NOT NULL REFERENCES turns (id) ON DELETE CASCADE,
	bot_id TEXT NOT NULL,
	state TEXT NOT NULL CHECK (state IN ('awaited', 'running')),
	PRIMARY KEY (turn_id, bot_id, state)
);
";

const CONVERSATION_LOOK: &str = "
ALTER TABLE conversations ADD COLUMN icon TEXT;
ALTER TABLE conversations ADD COLUMN color TEXT
	CHECK (color IN ('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange'));
";

pub fn latest_version() -> u32 {
	MIGRATIONS.last().map_or(0, |migration| migration.version)
}

pub fn apply(connection: &mut Connection) -> Result<(), DatabaseError> {
	apply_each(connection, MIGRATIONS)
}

fn apply_each(connection: &mut Connection, migrations: &[Migration]) -> Result<(), DatabaseError> {
	connection.pragma_update(None, "foreign_keys", "OFF")?;
	let applied = apply_pending(connection, migrations);
	connection.pragma_update(None, "foreign_keys", "ON")?;
	applied
}

fn apply_pending(
	connection: &mut Connection,
	migrations: &[Migration],
) -> Result<(), DatabaseError> {
	let mut installed = version(connection)?;
	for migration in migrations {
		if installed >= migration.version {
			continue;
		}
		let transaction = connection.transaction()?;
		transaction.execute_batch(migration.statements)?;
		transaction.pragma_update(None, "user_version", migration.version)?;
		transaction.commit()?;
		installed = migration.version;
	}
	Ok(())
}

pub fn version(connection: &Connection) -> Result<u32, DatabaseError> {
	Ok(connection.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::{open, temp_dir, FILE_NAME};

	const BOTS_HOLDING_A_MEMBERSHIP: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'personal', 1);
	";

	const BOTS_CARRYING_A_SPACE_COLUMN: &str = "
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1),
				('b2', 'personal', 'Second', 'sonnet', 1);
	";

	const FIXTURE: &str = "
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1), ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1),
				('c2', 'b1', 'assistant', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1), ('t2', 'c2', 1, 1);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'hello', 'complete', 1),
				('m2', 'c2', 't2', 1, 'user', 'hello', 'complete', 1);
		INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
			VALUES ('a1', 't1', 'tool', 'running', '{}', 1, 1);
	";

	const SPACE_SETTINGS_STEP: u32 = 19;
	const SEVERAL_LIVE_SESSIONS_STEP: u32 = 20;
	const CHECKPOINT_PER_SESSION_STEP: u32 = 21;
	const ROUTINE_TASK_STEP: u32 = 23;
	const ROUTINE_LAST_OCCURRENCE_STEP: u32 = 24;
	const ROUTINE_REPORTED_TURN_STEP: u32 = 25;
	const MISSIONS_STEP: u32 = 26;
	const MISSION_WATCH_STEP: u32 = 27;
	const MISSION_REPORT_STEP: u32 = 28;
	const MESSAGE_SEARCH_STEP: u32 = 29;
	const BOT_SPACES_STEP: u32 = 30;
	const SOLO_THREAD_PER_SPACE_STEP: u32 = 31;
	const MISSION_CHECKS_FAILED_STEP: u32 = 32;
	const APPLICATION_INSTALLS_STEP: u32 = 34;
	const APPLICATION_INSTALL_PRESENTATION_STEP: u32 = 35;
	const BOTS_WITHOUT_UNREAD_COLUMNS_STEP: u32 = 36;
	const MISSION_STATUS_STEP: u32 = 38;
	const MISSION_PROGRESS_STEP: u32 = 39;
	const BOTS_WITHOUT_DEFAULT_MODEL_STEP: u32 = 40;
	const BOTS_WITHOUT_WORKING_DIR_STEP: u32 = 41;
	const MISSION_REOPENED_STEP: u32 = 42;
	const MISSION_DISMISSED_STEP: u32 = 43;
	const BOTS_WITHOUT_ANIMAL_STEP: u32 = 44;
	const BOT_EFFORT_STEP: u32 = 45;
	const SPACE_HOSTING_STEP: u32 = 46;
	const MESSAGE_ACCOUNT_AUTHOR_STEP: u32 = 47;
	const SPACE_MEMBER_ROLES_STEP: u32 = 48;
	const SPACE_MEMBER_ROLES_DROPPED_STEP: u32 = 49;
	const CONVERSATION_ACTIVITY_STEP: u32 = 50;
	const TURN_RUNS_STEP: u32 = 52;
	const CONVERSATION_LOOK_STEP: u32 = 53;

	const A_LIVE_SESSION: &str = "INSERT INTO runtime_sessions
		(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
		VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1)";

	const A_CHECKPOINT: &str = "INSERT INTO context_checkpoints
		(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
			token_count, created_at)
		VALUES ('k1', 'c1', 'b1', 's1', 'the conversation so far', 1, 120, 1)";

	fn a_message_ending_in(state: &str, id: &str, seq: u32) -> String {
		format!(
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('{id}', 'c1', 't1', {seq}, 'assistant', 'hi', '{state}', 2)"
		)
	}

	fn a_checkpoint_naming(session: &str, id: &str, last_message_seq: u32) -> String {
		format!(
			"INSERT INTO context_checkpoints
				(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
					token_count, created_at)
				VALUES ('{id}', 'c1', 'b1', {session}, 'the conversation so far',
					{last_message_seq}, 120, 1)"
		)
	}

	fn shipped_before(version: u32) -> &'static [Migration] {
		let steps = MIGRATIONS.iter().take_while(|migration| migration.version < version).count();
		&MIGRATIONS[..steps]
	}

	fn only_step(version: u32) -> &'static [Migration] {
		let at = MIGRATIONS
			.iter()
			.position(|migration| migration.version == version)
			.unwrap_or_else(|| panic!("no step declares version {version}"));
		&MIGRATIONS[at..=at]
	}

	fn migrated(dir: &Path) -> Connection {
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		connection
	}

	fn fixture(dir: &Path) -> Connection {
		let connection = migrated(dir);
		connection
			.execute_batch(&format!("{BOTS_HOLDING_A_MEMBERSHIP}{FIXTURE}"))
			.expect("the fixture is inserted");
		connection
	}

	fn fixture_before_memberships() -> String {
		format!("{BOTS_CARRYING_A_SPACE_COLUMN}{FIXTURE}")
	}

	fn write(connection: &Connection, statement: &str) -> rusqlite::Result<usize> {
		connection.execute(statement, [])
	}

	const BROKEN: &[Migration] = &[
		Migration { version: 1, statements: CONVERSATIONS_SCHEMA },
		Migration {
			version: 2,
			statements: "CREATE TABLE half_landed (id TEXT PRIMARY KEY);
				CREATE TABLE half_landed (id TEXT PRIMARY KEY);",
		},
	];

	#[test]
	fn a_mission_stored_before_the_watch_step_reads_with_every_watch_column_empty() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_WATCH_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'personal', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
				INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
					VALUES ('e1', 'm1', 1, 'opened', 'bot', '{}', 1);",
			)
			.expect("the missions this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row(
					"SELECT watch_branch, watch_repository, watch_workspace_path, delivery_key,
						github_fingerprint FROM missions WHERE id = 'm1'",
					[],
					|row| Ok((
						row.get::<_, String>(0)?,
						row.get::<_, String>(1)?,
						row.get::<_, Option<String>>(2)?,
						row.get::<_, String>(3)?,
						row.get::<_, String>(4)?,
					)),
				)
				.expect("the stored mission reads"),
			(String::new(), String::new(), None, String::new(), String::new()),
			"the mission nobody armed did not come out of the step empty"
		);
		assert_eq!(
			connection
				.query_row("SELECT delivery_id FROM mission_events WHERE id = 'e1'", [], |row| {
					row.get::<_, String>(0)
				},)
				.expect("the stored event reads"),
			String::new(),
			"the event stored before the step lost its row"
		);
		assert!(
			has_index(&connection, "missions_one_mission_per_delivery_key"),
			"two missions could hold one delivery key"
		);
		assert!(
			has_index(&connection, "mission_events_one_event_per_delivery"),
			"one delivery could be appended twice"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn mission_events_stored_before_the_checks_failed_step_keep_their_rows_and_their_triggers() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_CHECKS_FAILED_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
				INSERT INTO mission_events
					(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
					VALUES ('e1', 'm1', 1, 'opened', 'bot', '{\"pullRequest\":7}', 1, 'd1'),
						('e2', 'm1', 2, 'ready', 'github', '{}', 2, '');",
			)
			.expect("the mission events this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			events_of(&connection, "m1"),
			vec![
				(
					"e1".to_owned(),
					1,
					"opened".to_owned(),
					"bot".to_owned(),
					"{\"pullRequest\":7}".to_owned(),
					1,
					"d1".to_owned(),
				),
				(
					"e2".to_owned(),
					2,
					"ready".to_owned(),
					"github".to_owned(),
					"{}".to_owned(),
					2,
					String::new(),
				),
			],
			"the step rewrote the events it was only meant to carry over"
		);
		let red = write(
			&connection,
			"INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e3', 'm1', 3, 'checks_failed', 'github', '{}', 3)",
		);
		let edit = write(&connection, "UPDATE mission_events SET source = 'human' WHERE id = 'e1'");
		let erase = write(&connection, "DELETE FROM mission_events WHERE id = 'e1'");

		assert!(red.is_ok(), "a red check had no word in the schema: {red:?}");
		assert!(edit.is_err(), "a mission event was edited after the rebuild");
		assert!(erase.is_err(), "a mission event was erased after the rebuild");
		assert!(
			has_index(&connection, "mission_events_one_event_per_delivery"),
			"the rebuild dropped the index holding one event per delivery"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn mission_events_stored_before_the_status_step_keep_their_rows_and_their_triggers() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_STATUS_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
				INSERT INTO mission_events
					(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
					VALUES ('e1', 'm1', 1, 'opened', 'bot', '{\"pullRequest\":7}', 1, 'd1'),
						('e2', 'm1', 2, 'agent_started', 'agent', '{}', 2, '');",
			)
			.expect("the mission events this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			events_of(&connection, "m1"),
			vec![
				(
					"e1".to_owned(),
					1,
					"opened".to_owned(),
					"bot".to_owned(),
					"{\"pullRequest\":7}".to_owned(),
					1,
					"d1".to_owned(),
				),
				(
					"e2".to_owned(),
					2,
					"agent_started".to_owned(),
					"agent".to_owned(),
					"{}".to_owned(),
					2,
					String::new(),
				),
			],
			"the step rewrote the events it was only meant to carry over"
		);
		let status = write(
			&connection,
			"INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e3', 'm1', 3, 'status', 'bot', '{\"text\":\"Paused\"}', 3)",
		);
		let edit = write(&connection, "UPDATE mission_events SET source = 'human' WHERE id = 'e1'");
		let erase = write(&connection, "DELETE FROM mission_events WHERE id = 'e1'");

		assert!(status.is_ok(), "a status had no word in the schema: {status:?}");
		assert!(edit.is_err(), "a mission event was edited after the rebuild");
		assert!(erase.is_err(), "a mission event was erased after the rebuild");
		assert!(
			has_index(&connection, "mission_events_one_event_per_delivery"),
			"the rebuild dropped the index holding one event per delivery"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn mission_events_of_every_kind_stored_before_the_reopened_step_keep_their_rows_and_triggers() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_REOPENED_STEP))
			.expect("the shipped schema");
		let stored = [
			"opened",
			"note",
			"agent_asked",
			"agent_started",
			"agent_stopped",
			"answered",
			"escalated",
			"ready",
			"checks_failed",
			"failed",
			"closed",
			"status",
		];
		let events = stored
			.iter()
			.enumerate()
			.map(|(at, kind)| {
				let seq = at + 1;
				format!("('e{seq}', 'm1', {seq}, '{kind}', 'bot', '{{}}', {seq}, 'd{seq}')")
			})
			.collect::<Vec<_>>()
			.join(", ");
		connection
			.execute_batch(&format!(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
				INSERT INTO mission_events
					(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
					VALUES {events};"
			))
			.expect("the mission events this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			events_of(&connection, "m1")
				.into_iter()
				.map(|(_, seq, kind, ..)| (seq, kind))
				.collect::<Vec<_>>(),
			stored
				.iter()
				.enumerate()
				.map(|(at, kind)| (at as i64 + 1, (*kind).to_owned()))
				.collect::<Vec<_>>(),
			"the step lost or rewrote an event it was only meant to carry over"
		);
		let reopened = write(
			&connection,
			"INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e99', 'm1', 99, 'reopened', 'person', '{}', 99)",
		);
		let edit = write(&connection, "UPDATE mission_events SET source = 'human' WHERE id = 'e1'");
		let erase = write(&connection, "DELETE FROM mission_events WHERE id = 'e1'");

		assert!(reopened.is_ok(), "a reopen had no word in the schema: {reopened:?}");
		assert!(edit.is_err(), "a mission event was edited after the rebuild");
		assert!(erase.is_err(), "a mission event was erased after the rebuild");
		assert!(
			has_index(&connection, "mission_events_one_event_per_delivery"),
			"the rebuild dropped the index holding one event per delivery"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn mission_events_of_every_kind_stored_before_the_dismissed_step_keep_rows_and_triggers() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_DISMISSED_STEP))
			.expect("the shipped schema");
		let stored = [
			"opened",
			"note",
			"agent_asked",
			"agent_started",
			"agent_stopped",
			"answered",
			"escalated",
			"ready",
			"checks_failed",
			"failed",
			"closed",
			"status",
			"reopened",
		];
		let events = stored
			.iter()
			.enumerate()
			.map(|(at, kind)| {
				let seq = at + 1;
				format!("('e{seq}', 'm1', {seq}, '{kind}', 'bot', '{{}}', {seq}, 'd{seq}')")
			})
			.collect::<Vec<_>>()
			.join(", ");
		connection
			.execute_batch(&format!(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1);
				INSERT INTO mission_events
					(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
					VALUES {events};"
			))
			.expect("the mission events this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			events_of(&connection, "m1")
				.into_iter()
				.map(|(_, seq, kind, ..)| (seq, kind))
				.collect::<Vec<_>>(),
			stored
				.iter()
				.enumerate()
				.map(|(at, kind)| (at as i64 + 1, (*kind).to_owned()))
				.collect::<Vec<_>>(),
			"the step lost or rewrote an event it was only meant to carry over"
		);
		let dismissed = write(
			&connection,
			"INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e99', 'm1', 99, 'dismissed', 'person', '{}', 99)",
		);
		let edit = write(&connection, "UPDATE mission_events SET source = 'human' WHERE id = 'e1'");
		let erase = write(&connection, "DELETE FROM mission_events WHERE id = 'e1'");

		assert!(dismissed.is_ok(), "a dismissal had no word in the schema: {dismissed:?}");
		assert!(edit.is_err(), "a mission event was edited after the rebuild");
		assert!(erase.is_err(), "a mission event was erased after the rebuild");
		assert!(
			has_index(&connection, "mission_events_one_event_per_delivery"),
			"the rebuild dropped the index holding one event per delivery"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_bot_stored_on_the_default_model_comes_back_on_opus_and_every_other_model_stays() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_DEFAULT_MODEL_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), MISSION_PROGRESS_STEP);
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'default', 1), ('b2', 'Second', 'sonnet', 1),
						('b3', 'Third', 'claude-opus-4-1-20250805', 1), ('b4', 'Fourth', 'Default', 1);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let mut statement =
			connection.prepare("SELECT id, model FROM bots ORDER BY id").expect("the bots read");
		let models = statement
			.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
			.expect("the rows")
			.collect::<Result<Vec<_>, _>>()
			.expect("every row");
		assert_eq!(
			models,
			vec![
				("b1".to_owned(), "opus".to_owned()),
				("b2".to_owned(), "sonnet".to_owned()),
				("b3".to_owned(), "claude-opus-4-1-20250805".to_owned()),
				("b4".to_owned(), "Default".to_owned()),
			]
		);
		drop(statement);
		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_bot_that_named_a_working_folder_keeps_every_other_value_once_the_column_leaves() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_WORKING_DIR_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), BOTS_WITHOUT_DEFAULT_MODEL_STEP);
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, instructions, title,
					avatar_image_path, working_dir, permissions, deleted_at)
				VALUES ('b1', 'Nyx', 'opus', 1, 'answer briefly', 'Reviewer',
					'/pictures/koala.png', '/work/kiroshi', '{}', 7),
					('b2', 'Ada', 'sonnet', 2, '', '', NULL, NULL, NULL, NULL);
				INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let kept = connection
			.prepare(
				"SELECT id, name, model, created_at, instructions, title, avatar_image_path,
					permissions, deleted_at
					FROM bots ORDER BY id",
			)
			.expect("the kept columns are all there")
			.query_map([], |row| {
				(0..9).map(|column| row.get::<_, rusqlite::types::Value>(column)).collect()
			})
			.expect("query")
			.collect::<Result<Vec<Vec<rusqlite::types::Value>>, _>>()
			.expect("the bots read back");
		let text = |value: &str| rusqlite::types::Value::Text(value.to_owned());
		let integer = rusqlite::types::Value::Integer;
		let null = rusqlite::types::Value::Null;
		assert_eq!(
			kept,
			vec![
				vec![
					text("b1"),
					text("Nyx"),
					text("opus"),
					integer(1),
					text("answer briefly"),
					text("Reviewer"),
					text("/pictures/koala.png"),
					text("{}"),
					integer(7),
				],
				vec![
					text("b2"),
					text("Ada"),
					text("sonnet"),
					integer(2),
					text(""),
					text(""),
					null.clone(),
					null.clone(),
					null,
				],
			],
		);
		assert_eq!(bot_spaces_of(&connection), vec![("b1".to_owned(), "personal".to_owned())]);
		assert!(
			connection.prepare("SELECT working_dir FROM bots").is_err(),
			"the bots table still carries working_dir"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_bot_that_wore_an_animal_keeps_every_other_value_once_the_column_leaves() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_ANIMAL_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), MISSION_DISMISSED_STEP);
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, instructions, memory, title,
					avatar_animal, avatar_image_path, commands, avatar_color, denied_tools,
					permissions, deleted_at)
				VALUES ('b1', 'Nyx', 'opus', 1, 'answer briefly', 'they use bun', 'Reviewer',
					'koala', '/pictures/koala.png', '[\"ship\"]', 'orange', '[\"Bash\"]',
					'{}', 7),
					('b2', 'Ada', 'sonnet', 2, '', '', '', 'owl', NULL, '[]', NULL, '[]',
					NULL, NULL);
				INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let kept = connection
			.prepare(
				"SELECT id, name, model, created_at, instructions, memory, title,
					avatar_image_path, commands, avatar_color, denied_tools, permissions,
					deleted_at
					FROM bots ORDER BY id",
			)
			.expect("the kept columns are all there")
			.query_map([], |row| {
				(0..13).map(|column| row.get::<_, rusqlite::types::Value>(column)).collect()
			})
			.expect("query")
			.collect::<Result<Vec<Vec<rusqlite::types::Value>>, _>>()
			.expect("the bots read back");
		let text = |value: &str| rusqlite::types::Value::Text(value.to_owned());
		let integer = rusqlite::types::Value::Integer;
		let null = rusqlite::types::Value::Null;
		assert_eq!(
			kept,
			vec![
				vec![
					text("b1"),
					text("Nyx"),
					text("opus"),
					integer(1),
					text("answer briefly"),
					text("they use bun"),
					text("Reviewer"),
					text("/pictures/koala.png"),
					text("[\"ship\"]"),
					text("orange"),
					text("[\"Bash\"]"),
					text("{}"),
					integer(7),
				],
				vec![
					text("b2"),
					text("Ada"),
					text("sonnet"),
					integer(2),
					text(""),
					text(""),
					text(""),
					null.clone(),
					text("[]"),
					null.clone(),
					text("[]"),
					null.clone(),
					null,
				],
			],
		);
		assert_eq!(bot_spaces_of(&connection), vec![("b1".to_owned(), "personal".to_owned())]);
		assert!(
			connection.prepare("SELECT avatar_animal FROM bots").is_err(),
			"the bots table still carries avatar_animal"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_fresh_file_ends_on_the_step_that_took_the_animal_off_every_bot() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert!(
			connection.prepare("SELECT avatar_animal FROM bots").is_err(),
			"a fresh bots table carries avatar_animal"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_bot_stored_before_the_effort_step_carries_no_effort_and_a_level_outside_five_is_refused() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOT_EFFORT_STEP)).expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), BOTS_WITHOUT_ANIMAL_STEP);
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'Nyx', 'opus', 1), ('b2', 'Ada', 'sonnet', 2);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let efforts = connection
			.prepare("SELECT effort FROM bots ORDER BY id")
			.expect("the bots carry an effort column")
			.query_map([], |row| row.get::<_, Option<String>>(0))
			.expect("query")
			.collect::<Result<Vec<_>, _>>()
			.expect("the efforts read back");
		assert_eq!(efforts, vec![None, None]);
		assert!(
			write(&connection, "UPDATE bots SET effort = 'extreme' WHERE id = 'b1'").is_err(),
			"a level outside the five reached the file"
		);
		assert_eq!(write(&connection, "UPDATE bots SET effort = 'xhigh' WHERE id = 'b1'"), Ok(1));

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_stored_before_the_account_author_step_reads_back_with_no_author() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MESSAGE_ACCOUNT_AUTHOR_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), SPACE_HOSTING_STEP);
		connection
			.execute_batch(&format!("{BOTS_HOLDING_A_MEMBERSHIP}{FIXTURE}"))
			.expect("the messages this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let authors = connection
			.prepare("SELECT id, author_account_id, author_name FROM messages ORDER BY id")
			.expect("the messages carry the author columns")
			.query_map([], |row| {
				Ok((
					row.get::<_, String>(0)?,
					row.get::<_, Option<String>>(1)?,
					row.get::<_, Option<String>>(2)?,
				))
			})
			.expect("query")
			.collect::<Result<Vec<_>, _>>()
			.expect("the authors read back");
		assert_eq!(authors, vec![("m1".to_owned(), None, None), ("m2".to_owned(), None, None)]);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_mission_stored_before_the_progress_step_carries_the_url_its_github_note_named() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_PROGRESS_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1),
						('c3', 'mission', 'Plan it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
						'https://kiroshi.test/tickets/42', 'Crash', '[]', 1),
						('m2', 'c1', 'b1', 'c3', 'Plan it', 'github', '43',
						'https://kiroshi.test/tickets/43', 'Plan', '[]', 1);
				INSERT INTO mission_events
					(id, mission_id, seq, kind, source, payload, created_at)
					VALUES ('e1', 'm1', 1, 'opened', 'bot', '{}', 1),
						('e2', 'm1', 2, 'note', 'github',
							'{\"pullRequest\":7,\"url\":\"https://kiroshi.test/pull/7\"}', 2),
						('e3', 'm2', 1, 'opened', 'bot', '{}', 1);",
			)
			.expect("the missions this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let mut statement = connection
			.prepare(
				"SELECT id, pull_request_url, last_activity_at, last_activity, commits_ahead,
					dirty_files FROM missions ORDER BY id",
			)
			.expect("the missions read");
		let rows = statement
			.query_map([], |row| {
				Ok((
					row.get::<_, String>(0)?,
					row.get::<_, Option<String>>(1)?,
					row.get::<_, Option<i64>>(2)?,
					row.get::<_, Option<String>>(3)?,
					row.get::<_, Option<i64>>(4)?,
					row.get::<_, Option<i64>>(5)?,
				))
			})
			.expect("the missions map")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("the missions collect");
		assert_eq!(
			rows,
			vec![
				(
					"m1".to_owned(),
					Some("https://kiroshi.test/pull/7".to_owned()),
					None,
					None,
					None,
					None
				),
				("m2".to_owned(), None, None, None, None, None),
			],
		);

		drop(statement);
		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn events_of(
		connection: &Connection,
		mission_id: &str,
	) -> Vec<(String, i64, String, String, String, i64, String)> {
		let mut statement = connection
			.prepare(
				"SELECT id, seq, kind, source, payload, created_at, delivery_id
					FROM mission_events WHERE mission_id = ?1 ORDER BY seq",
			)
			.expect("the events read");
		let rows = statement
			.query_map([mission_id], |row| {
				Ok((
					row.get(0)?,
					row.get(1)?,
					row.get(2)?,
					row.get(3)?,
					row.get(4)?,
					row.get(5)?,
					row.get(6)?,
				))
			})
			.expect("the events map");
		rows.map(|row| row.expect("an event row")).collect()
	}

	#[test]
	fn the_report_step_marks_the_missions_already_closed_and_leaves_the_open_ones_alone() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSION_REPORT_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'personal', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'mission', 'Fix it', 1, 1),
						('c3', 'mission', 'Ship it', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0);
				INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
					objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
					tools, opened_at, closed_at)
					VALUES ('m1', 'c1', 'b1', 'c2', 'Fix it', 'github', '42',
							'https://kiroshi.test/tickets/42', 'Crash', '[]', 1, 9),
						('m2', 'c1', 'b1', 'c3', 'Ship it', 'github', '43',
							'https://kiroshi.test/tickets/43', 'Ship', '[]', 2, NULL);",
			)
			.expect("the missions this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			reports_of(&connection),
			vec![("m1".to_owned(), Some(9), None), ("m2".to_owned(), None, None)],
			"the step did not settle the closed mission or it touched the open one"
		);
		assert!(
			has_index(&connection, "missions_closed_without_report"),
			"the read of the missions still owing a report has no index"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_search_step_indexes_the_settled_messages_and_takes_the_others_in_when_they_settle() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MESSAGE_SEARCH_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'personal', 'First', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'topic', 'Chat', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'lead', 1, 0);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
					VALUES ('m1', 'c1', 't1', 1, 'user', 'the cafe opens at dawn', 'complete', 1),
						('m2', 'c1', 't1', 2, 'assistant', 'the ca', 'streaming', 2),
						('m3', 'c1', 't1', 3, 'assistant', 'the bakery', 'interrupted', 3),
						('m4', 'c1', 't1', 4, 'assistant', '', 'pending', 4);",
			)
			.expect("the messages this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			indexed_ids(&connection),
			vec!["m1".to_owned(), "m3".to_owned()],
			"the step indexed an unfinished message or lost a settled one"
		);

		write(
			&connection,
			"UPDATE messages SET completion_state = 'complete', content = 'the cafe closes at dusk'
				WHERE id = 'm2'",
		)
		.expect("the streaming message settles");

		assert_eq!(
			indexed_ids(&connection),
			vec!["m1".to_owned(), "m2".to_owned(), "m3".to_owned()],
			"a message that settled after the step stayed out of the index"
		);
		assert_eq!(
			matched_ids(&connection, "dusk"),
			vec!["m2".to_owned()],
			"the index does not hold the text a message carried when it settled"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn indexed_ids(connection: &Connection) -> Vec<String> {
		let mut statement = connection
			.prepare("SELECT message_id FROM message_search ORDER BY message_id")
			.expect("the index is there");
		let rows = statement.query_map([], |row| row.get(0)).expect("the index reads");
		rows.collect::<rusqlite::Result<Vec<_>>>().expect("every index row reads")
	}

	fn matched_ids(connection: &Connection, word: &str) -> Vec<String> {
		let mut statement = connection
			.prepare("SELECT message_id FROM message_search WHERE message_search MATCH ?1")
			.expect("the index is there");
		let rows = statement.query_map([word], |row| row.get(0)).expect("the index reads");
		rows.collect::<rusqlite::Result<Vec<_>>>().expect("every matched row reads")
	}

	fn reports_of(connection: &Connection) -> Vec<(String, Option<i64>, Option<String>)> {
		let mut statement = connection
			.prepare("SELECT id, reported_at, reported_turn_id FROM missions ORDER BY id")
			.expect("the report columns are there");
		let rows = statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
			.expect("the missions read");
		rows.collect::<rusqlite::Result<Vec<_>>>().expect("every mission reads")
	}

	#[test]
	fn the_conversations_a_file_already_held_come_out_of_the_missions_step_untouched() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(MISSIONS_STEP)).expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'personal', 'First', 'sonnet', 1);
				INSERT INTO conversations
					(id, kind, space_id, title, instructions, created_at, updated_at, pin_position)
					VALUES ('c1', 'main', NULL, 'Chat', '', 1, 1, NULL),
						('c2', 'topic', 'personal', 'Room', 'be brief', 2, 3, 7);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b1', 'lead', 2, 0);
				INSERT INTO turns (id, conversation_id, seq, started_at)
					VALUES ('t1', 'c2', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
					VALUES ('m1', 'c2', 't1', 1, 'user', 'hello', 'complete', 1);",
			)
			.expect("the rooms this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			rooms_of(&connection),
			vec![
				(
					"c1".to_owned(),
					"main".to_owned(),
					Some("personal".to_owned()),
					"Chat".to_owned(),
					String::new(),
					None
				),
				(
					"c2".to_owned(),
					"topic".to_owned(),
					Some("personal".to_owned()),
					"Room".to_owned(),
					"be brief".to_owned(),
					Some(7),
				),
			],
			"the step that opened the mission kind cost the file its rooms"
		);
		assert_eq!(
			transcript_of(&connection, "c2"),
			vec!["hello".to_owned()],
			"the rebuilt table dropped the messages hanging off it"
		);
		assert!(
			has_index(&connection, "conversations_of_space"),
			"the space index was not rebuilt"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_thread_of_a_mission_is_a_conversation_the_schema_has_a_word_for() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let mission = write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c3', 'mission', 'Third', 1, 1)",
		);
		let invented = write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c4', 'errand', 'Fourth', 1, 1)",
		);

		assert!(mission.is_ok(), "a mission thread was refused: {mission:?}");
		assert!(invented.is_err(), "a kind the schema has no word for was stored");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_mission_event_is_appended_and_never_edited_nor_erased() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		connection.execute_batch(A_MISSION).expect("the mission is opened");

		let kind = write(
			&connection,
			"INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				VALUES ('e2', 'x1', 2, 'merged', 'bot', '{}', 2)",
		);
		let edit = write(&connection, "UPDATE mission_events SET kind = 'closed' WHERE id = 'e1'");
		let erase = write(&connection, "DELETE FROM mission_events WHERE id = 'e1'");
		write(&connection, "DELETE FROM missions WHERE id = 'x1'").expect("the mission is dropped");

		assert!(kind.is_err(), "an event kind the schema has no word for was stored");
		assert!(edit.is_err(), "a mission event was edited");
		assert!(erase.is_err(), "a mission event was erased under a standing mission");
		assert_eq!(
			count(&connection, "mission_events"),
			0,
			"the events of a dropped mission stayed behind"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_failing_step_rolls_back_its_tables_and_its_version() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");

		let outcome = apply_each(&mut connection, BROKEN);

		assert!(outcome.is_err(), "a broken step reported success");
		assert_eq!(version(&connection).expect("version"), 1, "a failed step kept its version");
		assert!(
			!has_table(&connection, "half_landed"),
			"a failed step left a table the schema does not know"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_installed_before_the_later_steps_keeps_its_rows_and_gains_their_columns() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..1]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);",
			)
			.expect("a bot written by the older build");

		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_ANIMAL_STEP))
			.expect("the file comes up to the last build that stored an animal");

		assert_eq!(version(&connection).expect("version"), MISSION_DISMISSED_STEP);
		assert_eq!(
			connection
				.query_row(
					"SELECT instructions, memory, name FROM bots WHERE id = 'b1'",
					[],
					|row| {
						Ok((
							row.get::<_, String>(0)?,
							row.get::<_, String>(1)?,
							row.get::<_, String>(2)?,
						))
					}
				)
				.expect("query"),
			(String::new(), String::new(), "First".to_owned()),
			"a bot from the older build did not survive the step that reads it"
		);
		assert_eq!(
			identity_of(&connection, "b1"),
			(String::new(), "cat".to_owned(), None),
			"a bot from the older build came out of the step without a face"
		);
		assert_eq!(
			connection
				.query_row("SELECT commands FROM bots WHERE id = 'b1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"[]",
			"a bot from the older build came out of the step offering something"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_bot_already_on_the_record_keeps_its_transcript_and_gains_a_face() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..2]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('default', 'Claude', 'sonnet', 1);",
			))
			.expect("the install this build upgrades from");

		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_ANIMAL_STEP))
			.expect("the file comes up to the last build that stored an animal");

		assert_eq!(version(&connection).expect("version"), MISSION_DISMISSED_STEP);
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the bot gained a face in cost it its transcript"
		);
		assert_eq!(identity_of(&connection, "default"), (String::new(), "cat".to_owned(), None));

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_bots_a_file_already_held_come_out_of_the_step_in_one_space() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..11]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 2);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'First', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'b1', 'assistant', 1);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			spaces_of(&connection),
			vec![("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0)],
			"the step did not lay down the one space every bot belongs to"
		);
		assert_eq!(
			bot_spaces_of(&connection),
			vec![
				("b1".to_owned(), "personal".to_owned()),
				("b2".to_owned(), "personal".to_owned())
			],
			"a bot came out of the step without the space it belongs to"
		);
		assert_eq!(
			rows_in(&connection, "conversation_participants"),
			1,
			"rebuilding the table the bots live in cost them their seats"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn an_empty_file_comes_out_of_the_step_holding_the_one_space() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");

		apply(&mut connection).expect("the schema installs");

		assert_eq!(
			spaces_of(&connection),
			vec![("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0)]
		);
		assert_eq!(
			connection
				.pragma_query_value(None, "foreign_keys", |row| row.get::<_, i64>(0))
				.expect("the foreign key switch"),
			1,
			"the steps left the file with nothing holding its references together"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_chats_a_file_already_held_come_out_of_the_step_in_the_space_of_their_bot() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..13]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'writers', 'First', 'sonnet', 1),
						('b2', 'writers', 'Second', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'topic', 'Launch', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'b2', 'assistant', 1), ('c1', 'b1', 'assistant', 2);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row("SELECT space_id FROM conversations WHERE id = 'c1'", [], |row| row
					.get::<_, Option<
					String,
				>>(0))
				.expect("query"),
			Some("writers".to_owned()),
			"a conversation from the older build came out of the step without a space"
		);
		assert_eq!(
			join_order_of(&connection, "c1"),
			vec![("b2".to_owned(), 0), ("b1".to_owned(), 1)],
			"the seats came out of the step in an order nobody sat down in"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_spaces_a_file_already_held_come_out_of_the_step_wearing_the_colour_they_wore() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..16]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'writers', 'First', 'sonnet', 1);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			spaces_of(&connection),
			vec![
				("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0),
				("writers".to_owned(), "Writers".to_owned(), Some("blue".to_owned()), 1)
			],
			"a space from the older build came out of the step wearing another colour"
		);
		assert_eq!(
			bot_spaces_of(&connection),
			vec![("b1".to_owned(), "writers".to_owned())],
			"rebuilding the table the spaces live in cost a bot its space"
		);
		write(
			&connection,
			"INSERT INTO spaces (id, name, position, created_at)
				VALUES ('plain', 'Plain', 2, 1)",
		)
		.expect("a space wearing no colour is refused");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_bot_pinned_in_a_section_before_the_membership_step_keeps_both() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOT_SPACES_STEP)).expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO sections (id, space_id, name, position, created_at)
					VALUES ('sec1', 'writers', 'Drafts', 0, 1);
				INSERT INTO bots (id, space_id, section_id, pin_position, name, model, created_at)
					VALUES ('b1', 'writers', 'sec1', 3, 'First', 'sonnet', 7),
						('b2', 'writers', NULL, NULL, 'Second', 'sonnet', 8);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			memberships_of(&connection),
			vec![
				("b1".to_owned(), "writers".to_owned(), Some("sec1".to_owned()), Some(3), 7),
				("b2".to_owned(), "writers".to_owned(), None, None, 8)
			],
			"the backfill lost the section or the pin a bot already held"
		);
		assert!(
			connection.prepare("SELECT space_id FROM bots").is_err(),
			"the bots table still carries the column the step drops"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_main_conversation_stored_before_the_solo_thread_step_takes_the_space_it_belongs_to() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SOLO_THREAD_PER_SPACE_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
				INSERT INTO bot_spaces (bot_id, space_id, joined_at)
					VALUES ('b1', 'writers', 2), ('b1', 'personal', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'main', 'Chat', 1, 1);
				INSERT INTO conversation_participants
					(conversation_id, bot_id, role, joined_at, join_seq)
					VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b2', 'assistant', 1, 0);",
			)
			.expect("the solo threads this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			space_of(&connection, "c1"),
			Some("personal".to_owned()),
			"the backfill did not give the thread the space of the oldest membership"
		);
		assert_eq!(
			space_of(&connection, "c2"),
			None,
			"a thread whose bot holds no membership came out of the step carrying a space"
		);
		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn space_of(connection: &Connection, conversation_id: &str) -> Option<String> {
		connection
			.query_row(
				"SELECT space_id FROM conversations WHERE id = ?1",
				[conversation_id],
				|row| row.get(0),
			)
			.expect("the conversation reads")
	}

	type StoredMembership = (String, String, Option<String>, Option<i64>, i64);

	fn memberships_of(connection: &Connection) -> Vec<StoredMembership> {
		let mut statement = connection
			.prepare(
				"SELECT bot_id, space_id, section_id, pin_position, joined_at FROM bot_spaces
					ORDER BY bot_id, space_id",
			)
			.expect("prepare");
		statement
			.query_map([], |row| {
				Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
			})
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn join_order_of(connection: &Connection, conversation_id: &str) -> Vec<(String, i64)> {
		let mut statement = connection
			.prepare(
				"SELECT bot_id, join_seq FROM conversation_participants
					WHERE conversation_id = ?1 ORDER BY join_seq",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn spaces_of(connection: &Connection) -> Vec<(String, String, Option<String>, i64)> {
		let mut statement = connection
			.prepare("SELECT id, name, colour, position FROM spaces ORDER BY position, id")
			.expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn bot_spaces_of(connection: &Connection) -> Vec<(String, String)> {
		let mut statement = connection
			.prepare("SELECT bot_id, space_id FROM bot_spaces ORDER BY bot_id, space_id")
			.expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn rows_in(connection: &Connection, table: &str) -> i64 {
		connection
			.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
			.expect("query")
	}

	#[test]
	fn a_fresh_install_and_an_upgraded_file_come_out_the_same_shape() {
		let fresh_dir = temp_dir();
		let upgraded_dir = temp_dir();
		let mut fresh = open(&fresh_dir.join(FILE_NAME)).expect("open");
		let mut upgraded = open(&upgraded_dir.join(FILE_NAME)).expect("open");
		apply_each(&mut upgraded, &MIGRATIONS[..2]).expect("the shipped schema installs");

		apply(&mut fresh).expect("the schema installs");
		apply(&mut upgraded).expect("the file comes up to this build");

		assert_eq!(version(&fresh).expect("version"), version(&upgraded).expect("version"));
		assert_eq!(
			schema_of(&fresh),
			schema_of(&upgraded),
			"a file that was upgraded holds a different schema than one installed fresh"
		);

		drop(fresh);
		drop(upgraded);
		fs::remove_dir_all(&fresh_dir).expect("cleanup");
		fs::remove_dir_all(&upgraded_dir).expect("cleanup");
	}

	#[test]
	fn every_step_declares_a_version_no_other_step_uses() {
		for pair in MIGRATIONS.windows(2) {
			assert!(
				pair[0].version < pair[1].version,
				"version {} is declared out of order or by two steps",
				pair[1].version
			);
		}
	}

	#[test]
	fn a_file_that_missed_the_space_settings_step_gains_the_table() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SPACE_SETTINGS_STEP))
			.expect("the build that shipped without the settings step installs");
		assert!(!has_table(&connection, "space_settings"), "the file already held the table");

		apply(&mut connection).expect("the file comes up to this build");

		assert!(has_table(&connection, "space_settings"), "the file never gained the table");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_missed_the_application_installs_step_gains_the_table_and_keeps_its_rows() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(APPLICATION_INSTALLS_STEP))
			.expect("the build that shipped without the installs step installs");
		write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c1', 'main', 'Chat', 1, 1)",
		)
		.expect("a conversation of the older build");
		assert!(!has_table(&connection, "application_installs"), "the file already held the table");

		apply(&mut connection).expect("the file comes up to this build");

		assert!(has_table(&connection, "application_installs"), "the file never gained the table");
		assert!(
			has_index(&connection, "application_installs_in_order"),
			"the read of one conversation is served by no index"
		);
		assert_eq!(
			connection
				.query_row("SELECT title FROM conversations WHERE id = 'c1'", [], |row| row
					.get::<_, String>(0))
				.expect("the conversation of the older build reads back"),
			"Chat",
			"the step lost a conversation written before it"
		);
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn an_install_written_before_its_presentation_was_stored_keeps_its_name_and_logo() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(APPLICATION_INSTALL_PRESENTATION_STEP))
			.expect("the build that stored no presentation installs");
		write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c1', 'main', 'Chat', 1, 1);",
		)
		.expect("a conversation of the older build");
		write(
			&connection,
			"INSERT INTO application_installs (id, conversation_id, application, title, logo,
				scope, install_kind, last_message_seq, created_at)
				VALUES ('i1', 'c1', 'superset', 'Superset', '<svg/>', 'user', 'oauth', 0, 1)",
		)
		.expect("an install of the older build");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			connection
				.query_row(
					"SELECT title, logo, logo_url, description FROM application_installs
						WHERE id = 'i1'",
					[],
					|row| Ok((
						row.get::<_, String>(0)?,
						row.get::<_, Option<String>>(1)?,
						row.get::<_, Option<String>>(2)?,
						row.get::<_, Option<String>>(3)?,
					)),
				)
				.expect("the install of the older build reads back"),
			("Superset".to_owned(), Some("<svg/>".to_owned()), None, None),
		);
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn bots_written_before_the_unread_columns_left_keep_every_row_and_value() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_UNREAD_COLUMNS_STEP))
			.expect("the build that still carried the unread columns installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, instructions, memory, title,
					description, avatar_animal, avatar_pose, avatar_image_path, working_dir,
					avatar_blot, commands, avatar_color, denied_tools, permissions, deleted_at)
				VALUES ('b1', 'Nyx', 'opus', 1, 'answer briefly', 'they use bun', 'Reviewer',
					'reads diffs', 'koala', 'sleeping', '/pictures/koala.png', '/work/kiroshi',
					'coral', '[\"ship\"]', 'orange', '[\"Bash\"]', '{}', 7),
					('b2', 'Ada', 'sonnet', 2, '', '', '', '', 'cat', 'idle', NULL, NULL, NULL,
					'[]', NULL, '[]', NULL, NULL);
			INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);",
			)
			.expect("bots of the older build");

		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_ANIMAL_STEP))
			.expect("the file comes up to the last build that stored an animal");

		let kept = connection
			.prepare(
				"SELECT id, name, model, created_at, instructions, memory, title, avatar_animal,
					avatar_image_path, commands, avatar_color, denied_tools, permissions,
					deleted_at
					FROM bots ORDER BY id",
			)
			.expect("the kept columns are all there")
			.query_map([], |row| {
				(0..14).map(|column| row.get::<_, rusqlite::types::Value>(column)).collect()
			})
			.expect("query")
			.collect::<Result<Vec<Vec<rusqlite::types::Value>>, _>>()
			.expect("the bots read back");
		let text = |value: &str| rusqlite::types::Value::Text(value.to_owned());
		let integer = rusqlite::types::Value::Integer;
		let null = rusqlite::types::Value::Null;
		assert_eq!(
			kept,
			vec![
				vec![
					text("b1"),
					text("Nyx"),
					text("opus"),
					integer(1),
					text("answer briefly"),
					text("they use bun"),
					text("Reviewer"),
					text("koala"),
					text("/pictures/koala.png"),
					text("[\"ship\"]"),
					text("orange"),
					text("[\"Bash\"]"),
					text("{}"),
					integer(7),
				],
				vec![
					text("b2"),
					text("Ada"),
					text("sonnet"),
					integer(2),
					text(""),
					text(""),
					text(""),
					text("cat"),
					null.clone(),
					text("[]"),
					null.clone(),
					text("[]"),
					null.clone(),
					null,
				],
			],
		);
		for dropped in ["description", "avatar_pose", "avatar_blot"] {
			let read = connection.prepare(&format!("SELECT {dropped} FROM bots"));
			assert!(read.is_err(), "the bots table still carries {dropped}");
		}
		write(&connection, "DELETE FROM bots WHERE id = 'b1'").expect("the bot is deleted");
		assert_eq!(
			connection
				.query_row("SELECT COUNT(*) FROM bot_spaces", [], |row| row.get::<_, i64>(0))
				.expect("query"),
			0,
			"a membership outlived its rebuilt bot"
		);
		assert_eq!(version(&connection).expect("version"), MISSION_DISMISSED_STEP);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_key_install_naming_no_secret_is_refused_by_the_table() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c1', 'main', 'Chat', 1, 1)",
		)
		.expect("a conversation");

		let refused = write(
			&connection,
			"INSERT INTO application_installs (id, conversation_id, application, title, scope,
				install_kind, last_message_seq, created_at)
				VALUES ('i1', 'c1', 'superset', 'Superset', 'user', 'key', 0, 1)",
		);

		assert!(refused.is_err(), "a key install landed without the name of its secret");
		write(
			&connection,
			"INSERT INTO application_installs (id, conversation_id, application, title, scope,
				install_kind, secret_name, last_message_seq, created_at)
				VALUES ('i1', 'c1', 'superset', 'Superset', 'user', 'key', 'SUPERSET_API_KEY', 0, 1)",
		)
		.expect("a key install naming its secret lands");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_gives_a_routine_a_task_leaves_one_written_earlier_readable() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_TASK_STEP))
			.expect("the build that shipped a routine without a task installs");
		connection.execute_batch(&fixture_before_memberships()).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the older build");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row("SELECT title, instruction FROM routines WHERE id = 'r1'", [], |row| Ok(
					(row.get::<_, String>(0)?, row.get::<_, String>(1)?)
				))
				.expect("the routine of the older build reads back"),
			(String::new(), String::new()),
			"the step left a routine written before it unreadable"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_missed_the_last_occurrence_step_gains_the_column_and_keeps_its_routines() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_LAST_OCCURRENCE_STEP))
			.expect("the build that shipped without the occurrence column installs");
		connection.execute_batch(&fixture_before_memberships()).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the earlier build");

		apply(&mut connection).expect("the file comes up to this build");

		let held: Option<i64> = connection
			.query_row("SELECT last_occurrence_at FROM routines WHERE id = 'r1'", [], |row| {
				row.get(0)
			})
			.expect("the column is there and the row survived");
		assert_eq!(held, None, "a routine that never fired carries no occurrence");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_missed_the_reported_turn_step_gains_the_column_and_keeps_its_runs() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_REPORTED_TURN_STEP))
			.expect("the build that shipped without the reported turn installs");
		connection.execute_batch(&fixture_before_memberships()).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the earlier build");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1)",
		)
		.expect("a run of the earlier build");

		apply(&mut connection).expect("the file comes up to this build");

		let held: (Option<String>, Option<i64>) = connection
			.query_row(
				"SELECT reported_turn_id, ended_at FROM routine_runs WHERE id = 'run1'",
				[],
				|row| Ok((row.get(0)?, row.get(1)?)),
			)
			.expect("the column is there and the row survived");
		assert_eq!(held, (None, Some(2)), "a run written before the step reported in no turn");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_second_run_naming_a_turn_already_reported_in_is_refused_by_the_schema() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1, 't1')",
		)
		.expect("a run that reported in a turn");

		let refused = write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run2', 'r1', 3, 4, 'ok', 3, 't1')",
		);

		assert!(refused.is_err(), "a turn was reported in by two runs");
		assert_eq!(rows_in(&connection, "routine_runs"), 1, "the refused run landed anyway");
		assert!(
			has_index(&connection, "routine_runs_one_run_per_reported_turn"),
			"the reported turn carries no unique index"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_turn_that_goes_leaves_the_run_that_reported_in_it_naming_no_turn() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1, 't1')",
		)
		.expect("a run that reported in a turn");

		write(&connection, "DELETE FROM turns WHERE id = 't1'").expect("the delete lands");

		let held: Option<String> = connection
			.query_row("SELECT reported_turn_id FROM routine_runs WHERE id = 'run1'", [], |row| {
				row.get(0)
			})
			.expect("the run survived the turn");
		assert_eq!(held, None, "the run kept a turn that is gone");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_routine_and_what_hangs_off_it_go_with_the_participant_that_holds_them() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
				VALUES ('run1', 'r1', 1, 1)",
		)
		.expect("a started run");
		write(
			&connection,
			"INSERT INTO routine_dedupe_values (routine_id, value, seen_at)
				VALUES ('r1', 'once', 1)",
		)
		.expect("a dedupe value");

		write(&connection, "DELETE FROM conversations WHERE id = 'c1'").expect("the delete lands");

		for table in ["routines", "routine_runs", "routine_dedupe_values"] {
			let left: u32 = connection
				.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
				.expect("query");
			assert_eq!(left, 0, "{table} kept a row of a conversation that is gone");
		}

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_routine_holds_one_open_run_at_a_time_and_never_an_outcome_without_an_end() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
				VALUES ('run1', 'r1', 1, 1)",
		)
		.expect("a started run");

		assert!(
			write(
				&connection,
				"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
					VALUES ('run2', 'r1', 2, 2)",
			)
			.is_err(),
			"a second lease was taken while the first was open"
		);
		assert!(
			write(
				&connection,
				"INSERT INTO routine_runs (id, routine_id, started_at, outcome, lease_renewed_at)
					VALUES ('run3', 'r1', 3, 'ok', 3)",
			)
			.is_err(),
			"a run took an outcome without an end"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_already_holds_space_settings_keeps_its_rows() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		write(
			&connection,
			"INSERT INTO space_settings (space_id, key, value)
				VALUES ('personal', 'sidebar', 'open')",
		)
		.expect("a setting written by the build that shipped the table first");
		connection
			.pragma_update(None, "user_version", SPACE_SETTINGS_STEP - 1)
			.expect("the version the merged build left behind");

		apply_each(&mut connection, only_step(SPACE_SETTINGS_STEP))
			.expect("the step the merged build skipped runs again");

		assert_eq!(
			connection
				.query_row(
					"SELECT value FROM space_settings WHERE space_id = 'personal'
						AND key = 'sidebar'",
					[],
					|row| row.get::<_, String>(0)
				)
				.expect("query"),
			"open",
			"the step dropped a setting the older build had written"
		);
		assert_eq!(version(&connection).expect("version"), SPACE_SETTINGS_STEP);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn schema_of(connection: &Connection) -> Vec<(String, String)> {
		let mut statement = connection
			.prepare(
				"SELECT name, COALESCE(sql, '') FROM sqlite_master
					WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
			)
			.expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	#[test]
	fn running_the_steps_again_on_an_up_to_date_file_changes_nothing() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		write(
			&connection,
			"INSERT INTO bots (id, name, model, created_at, title, avatar_image_path)
				VALUES ('b1', 'First', 'sonnet', 1, 'Reviewer', '/pictures/owl.png')",
		)
		.expect("a bot written between the two runs");

		apply(&mut connection).expect("the steps run a second time");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row("SELECT title, avatar_image_path FROM bots WHERE id = 'b1'", [], |row| {
					Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
				},)
				.expect("query"),
			("Reviewer".to_owned(), Some("/pictures/owl.png".to_owned())),
			"a second run rewrote a row it had nothing to do with"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_blot_outside_the_palette_is_refused_and_no_blot_is_allowed() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		for blot in ["red", "yellow", "green", "cyan", "blue", "purple", "pink", "orange"] {
			assert!(
				write(&connection, &a_bot_marked(Some(blot), blot)).is_ok(),
				"the palette holds {blot} and the file refused it"
			);
		}
		assert!(
			write(&connection, &a_bot_marked(None, "unmarked")).is_ok(),
			"a bot with no mark was refused"
		);
		assert_eq!(blot_of(&connection, "unmarked"), None);
		assert!(
			write(&connection, &a_bot_marked(Some("chartreuse"), "unknown-blot")).is_err(),
			"a colour outside the palette was stored"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_names_the_denied_tools_carries_the_switch_it_replaces() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..6]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, changes_nothing)
					VALUES ('held', 'Held', 'sonnet', 1, 1),
					       ('free', 'Free', 'sonnet', 2, 0);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			denied_tools_of(&connection, "held"),
			r#"["Bash","Edit","NotebookEdit","Write"]"#,
			"a bot set to change nothing came up denying nothing"
		);
		assert_eq!(denied_tools_of(&connection, "free"), "[]");
		assert!(
			connection
				.query_row("SELECT changes_nothing FROM bots", [], |row| row.get::<_, i64>(0))
				.is_err(),
			"the switch the list replaced is still a column"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_names_the_run_leaves_every_message_already_written_without_one() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..8]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('default', 'Claude', 'sonnet', 1);",
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the messages gained a run in cost the chat its transcript"
		);
		assert_eq!(
			runs_named_in(&connection, "c1"),
			vec![None, None],
			"the step named a run on a message written before there was one"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_moves_the_pin_to_a_bubble_carries_it_over_and_leaves_the_transcript_whole() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..10]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at, denied_tools)
					VALUES ('default', 'Claude', 'sonnet', 1, '[]');",
			))
			.expect("the install this build upgrades from");
		connection
			.execute("UPDATE messages SET pinned_at = 42 WHERE id = 'm2'", [])
			.expect("the pin this build carries over");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the pin moved to a bubble in cost the chat its transcript"
		);
		assert_eq!(
			pins_held_in(&connection, "c1"),
			vec![("m2".to_owned(), 0, 42)],
			"the step lost the pin the reader had set or moved it off the first bubble"
		);
		assert!(
			!has_index(&connection, "messages_pinned"),
			"the step left the index the pin column carried behind"
		);
		assert!(
			connection
				.query_row("SELECT pinned_at FROM messages", [], |row| row.get::<_, i64>(0))
				.is_err(),
			"the column the pin table replaced is still on the messages"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn pins_held_in(connection: &Connection, conversation_id: &str) -> Vec<(String, i64, i64)> {
		let mut statement = connection
			.prepare(
				"SELECT message_id, block_index, pinned_at FROM message_pins
					WHERE conversation_id = ?1 ORDER BY message_id ASC, block_index ASC",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn has_index(connection: &Connection, name: &str) -> bool {
		connection
			.query_row(
				"SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
				[name],
				|row| row.get::<_, u32>(0),
			)
			.expect("query")
			> 0
	}

	fn runs_named_in(connection: &Connection, conversation_id: &str) -> Vec<Option<String>> {
		let mut statement = connection
			.prepare(
				"SELECT runtime_session_id FROM messages
					WHERE conversation_id = ?1 ORDER BY seq ASC",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| row.get::<_, Option<String>>(0))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn denied_tools_of(connection: &Connection, id: &str) -> String {
		connection
			.query_row("SELECT denied_tools FROM bots WHERE id = ?1", [id], |row| row.get(0))
			.expect("the denials")
	}

	#[test]
	fn the_step_that_adds_the_pin_pins_what_a_section_held_and_leaves_the_rest_loose() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..15])
			.expect("the install this build upgrades from");
		connection
			.execute_batch(
				"INSERT INTO sections (id, space_id, name, position, created_at)
					VALUES ('writers', 'personal', 'Writers', 0, 1);
				INSERT INTO bots (id, space_id, section_id, name, model, created_at)
					VALUES ('held', 'personal', 'writers', 'Held', 'sonnet', 2),
						('later', 'personal', 'writers', 'Later', 'sonnet', 3),
						('loose', 'personal', NULL, 'Loose', 'sonnet', 4);
				INSERT INTO conversations
					(id, kind, space_id, section_id, title, created_at, updated_at)
					VALUES ('room', 'topic', 'personal', 'writers', 'Room', 1, 1);",
			)
			.expect("a space a section already holds");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			bot_pin_of(&connection, "held"),
			Some(1),
			"a bot a section held came out of the step loose"
		);
		assert_eq!(bot_pin_of(&connection, "later"), Some(2));
		assert_eq!(
			pin_of(&connection, "conversations", "room"),
			Some(0),
			"a conversation a section held came out of the step loose"
		);
		assert_eq!(bot_pin_of(&connection, "loose"), None, "the step pinned a bot no section held");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn bot_pin_of(connection: &Connection, bot_id: &str) -> Option<i64> {
		connection
			.query_row("SELECT pin_position FROM bot_spaces WHERE bot_id = ?1", [bot_id], |row| {
				row.get(0)
			})
			.expect("query")
	}

	fn pin_of(connection: &Connection, table: &str, id: &str) -> Option<i64> {
		connection
			.query_row(&format!("SELECT pin_position FROM {table} WHERE id = ?1"), [id], |row| {
				row.get(0)
			})
			.expect("query")
	}

	#[test]
	fn the_step_that_adds_the_mark_leaves_every_bot_unmarked_and_its_transcript_whole() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..3]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at, title, avatar_animal, avatar_pose)
					VALUES ('default', 'Claude', 'sonnet', 1, 'Reviewer', 'owl', 'curious');",
			))
			.expect("the install this build upgrades from");

		apply_each(&mut connection, shipped_before(BOTS_WITHOUT_ANIMAL_STEP))
			.expect("the file comes up to the last build that stored an animal");

		assert_eq!(version(&connection).expect("version"), MISSION_DISMISSED_STEP);
		assert_eq!(blot_of(&connection, "default"), None, "the step marked a bot nobody marked");
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the bot gained a mark in cost it its transcript"
		);
		assert_eq!(
			identity_of(&connection, "default"),
			("Reviewer".to_owned(), "owl".to_owned(), None),
			"the step rewrote the face it was told to leave alone"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_renames_the_marks_carries_every_bot_to_its_new_name() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..6]).expect("the build before the rename");
		let marked = [
			("coral", "red"),
			("amber", "yellow"),
			("moss", "green"),
			("water", "cyan"),
			("sky", "blue"),
			("lavender", "purple"),
			("rose", "pink"),
			("slate", "orange"),
		];
		let rows: String = marked
			.iter()
			.map(|(was, _)| {
				format!(
					"INSERT INTO bots (id, name, model, created_at, avatar_blot)
						VALUES ('{was}', 'A bot', 'sonnet', 1, '{was}');"
				)
			})
			.collect();
		connection
			.execute_batch(&format!(
				"{rows}
				INSERT INTO bots (id, name, model, created_at)
					VALUES ('unmarked', 'A bot', 'sonnet', 1);"
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		for (was, now) in marked {
			assert_eq!(
				blot_of(&connection, was).as_deref(),
				Some(now),
				"the bot stored as {was} did not come up as {now}"
			);
		}
		assert_eq!(blot_of(&connection, "unmarked"), None, "the step marked a bot nobody marked");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_chat_held_by(bot: &str) -> String {
		format!(
			"{bot}
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'default', 'assistant', 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, author_bot_id, seq, role, content,
						completion_state, created_at)
					VALUES ('m1', 'c1', 't1', NULL, 1, 'user', 'hello', 'complete', 1),
						('m2', 'c1', 't1', 'default', 2, 'assistant', 'hi there', 'complete', 2);"
		)
	}

	fn a_bot_marked(blot: Option<&str>, id: &str) -> String {
		let mark = blot.map_or("NULL".to_owned(), |blot| format!("'{blot}'"));
		format!(
			"INSERT INTO bots (id, name, model, created_at, avatar_color)
				VALUES ('{id}', 'A bot', 'sonnet', 1, {mark})"
		)
	}

	fn blot_of(connection: &Connection, id: &str) -> Option<String> {
		connection
			.query_row("SELECT avatar_color FROM bots WHERE id = ?1", [id], |row| row.get(0))
			.expect("query")
	}

	type StoredIdentity = (String, String, Option<String>);

	fn identity_of(connection: &Connection, id: &str) -> StoredIdentity {
		connection
			.query_row(
				"SELECT title, avatar_animal, avatar_image_path FROM bots WHERE id = ?1",
				[id],
				|row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
			)
			.expect("query")
	}

	fn transcript_of(connection: &Connection, conversation_id: &str) -> Vec<String> {
		let mut statement = connection
			.prepare("SELECT content FROM messages WHERE conversation_id = ?1 ORDER BY seq ASC")
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| row.get::<_, String>(0))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	type StoredRoom = (String, String, Option<String>, String, String, Option<i64>);

	fn rooms_of(connection: &Connection) -> Vec<StoredRoom> {
		let mut statement = connection
			.prepare(
				"SELECT id, kind, space_id, title, instructions, pin_position
					FROM conversations ORDER BY id ASC",
			)
			.expect("prepare");
		statement
			.query_map([], |row| {
				Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
			})
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn count(connection: &Connection, table: &str) -> u32 {
		connection
			.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
			.expect("query")
	}

	const A_MISSION: &str = "
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c9', 'mission', 'personal', 'Fix the crash', 1, 1);
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
			objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
			tools, opened_at)
			VALUES ('x1', 'c1', 'b1', 'c9', 'Fix the crash', 'github', '42',
				'https://kiroshi.test/tickets/42', 'Crash on open', '[]', 1);
		INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
			VALUES ('e1', 'x1', 1, 'opened', 'bot', '{}', 1);
	";

	fn has_table(connection: &Connection, name: &str) -> bool {
		connection
			.query_row(
				"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
				[name],
				|row| row.get::<_, u32>(0),
			)
			.expect("query")
			> 0
	}

	#[test]
	fn a_hosting_row_leaves_with_its_space_and_never_shares_an_instance() {
		let dir = temp_dir();
		let connection = migrated(&dir);
		write(
			&connection,
			"INSERT INTO spaces (id, name, position, created_at) VALUES ('work', 'Work', 1, 1)",
		)
		.expect("the space is inserted");
		write(
			&connection,
			"INSERT INTO space_hosting (space_id, instance_id, is_hosted) VALUES ('work', 'i1', 1)",
		)
		.expect("the hosting row is inserted");

		let duplicate = write(
			&connection,
			"INSERT INTO space_hosting (space_id, instance_id, is_hosted)
				VALUES ('personal', 'i1', 0)",
		);
		let second_row_for_a_space = write(
			&connection,
			"INSERT INTO space_hosting (space_id, instance_id, is_hosted) VALUES ('work', 'i2', 1)",
		);
		write(&connection, "DELETE FROM spaces WHERE id = 'work'").expect("the space leaves");

		assert!(duplicate.is_err(), "two spaces held the same instance");
		assert!(second_row_for_a_space.is_err(), "a space held two instances");
		assert_eq!(count(&connection, "space_hosting"), 0);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_holding_member_roles_comes_up_without_them_and_keeps_its_space() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SPACE_MEMBER_ROLES_DROPPED_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), SPACE_MEMBER_ROLES_STEP);
		write(
			&connection,
			"INSERT INTO spaces (id, name, position, created_at) VALUES ('work', 'Work', 1, 1)",
		)
		.expect("the space is inserted");
		write(
			&connection,
			"INSERT INTO space_member_roles (space_id, user_id, role) VALUES ('work', 'u1', 'guest')",
		)
		.expect("the role is inserted");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert!(!has_table(&connection, "space_member_roles"), "the member roles survived");
		assert_eq!(count(&connection, "spaces"), 2);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn last_activity_of(connection: &Connection, conversation_id: &str) -> i64 {
		connection
			.query_row(
				"SELECT last_activity_at FROM conversations WHERE id = ?1",
				[conversation_id],
				|row| row.get(0),
			)
			.expect("the activity is read")
	}

	fn a_message_at(conversation_id: &str, id: &str, seq: u32, created_at: i64) -> String {
		format!(
			"INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('t-{id}', '{conversation_id}', {seq}, {created_at});
			INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('{id}', '{conversation_id}', 't-{id}', {seq}, 'user', 'hi', 'complete',
					{created_at});"
		)
	}

	#[test]
	fn conversation_activity_is_backfilled_then_moved_forward_by_each_new_message() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(CONVERSATION_ACTIVITY_STEP))
			.expect("the shipped schema");
		connection
			.execute_batch(&format!(
				"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
					VALUES ('spoken', 'topic', 'personal', 'Spoken', 5, 5),
						('silent', 'topic', 'personal', 'Silent', 4, 4);
				{}{}",
				a_message_at("spoken", "m1", 1, 9),
				a_message_at("spoken", "m2", 2, 7),
			))
			.expect("the rows are inserted");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(last_activity_of(&connection, "spoken"), 9, "not the newest message");
		assert_eq!(last_activity_of(&connection, "silent"), 4, "not the creation time");

		connection
			.execute_batch(&format!(
				"{}{}INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
					VALUES ('fresh', 'topic', 'personal', 'Fresh', 60, 60);",
				a_message_at("silent", "m3", 1, 50),
				a_message_at("spoken", "m4", 3, 3),
			))
			.expect("the new rows are inserted");

		assert_eq!(last_activity_of(&connection, "silent"), 50, "a new message did not move it");
		assert_eq!(last_activity_of(&connection, "spoken"), 9, "an older message moved it back");
		assert_eq!(last_activity_of(&connection, "fresh"), 60, "a new room starts at zero");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn turn_runs_install_beside_the_turns_already_kept_and_go_with_their_turn() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(TURN_RUNS_STEP)).expect("the shipped schema");
		connection
			.execute_batch(&format!(
				"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
					VALUES ('room', 'topic', 'personal', 'Room', 1, 1);
				{}",
				a_message_at("room", "m1", 1, 2),
			))
			.expect("the rows are inserted");

		apply(&mut connection).expect("the file comes up to this build");
		write(
			&connection,
			"INSERT INTO turn_runs (turn_id, bot_id, state) VALUES ('t-m1', 'b1', 'running')",
		)
		.expect("a run of a kept turn is accepted");
		let unknown_state = write(
			&connection,
			"INSERT INTO turn_runs (turn_id, bot_id, state) VALUES ('t-m1', 'b2', 'paused')",
		);
		write(&connection, "DELETE FROM turns WHERE id = 't-m1'").expect("the turn goes");
		let runs_left: i64 = connection
			.query_row("SELECT COUNT(*) FROM turn_runs", [], |row| row.get(0))
			.expect("the runs count");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert!(unknown_state.is_err(), "a run in an unknown state was accepted");
		assert_eq!(runs_left, 0, "a run outlived its turn");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn conversations_kept_before_the_look_step_wear_no_icon_and_refuse_a_colour_outside_eight() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(CONVERSATION_LOOK_STEP))
			.expect("the shipped schema");
		assert_eq!(version(&connection).expect("version"), TURN_RUNS_STEP);
		connection
			.execute_batch(&format!("{BOTS_HOLDING_A_MEMBERSHIP}{FIXTURE}"))
			.expect("the conversations this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		let looks = connection
			.prepare("SELECT id, title, icon, color FROM conversations ORDER BY id")
			.expect("the conversations carry the look columns")
			.query_map([], |row| {
				Ok((
					row.get::<_, String>(0)?,
					row.get::<_, String>(1)?,
					row.get::<_, Option<String>>(2)?,
					row.get::<_, Option<String>>(3)?,
				))
			})
			.expect("query")
			.collect::<Result<Vec<_>, _>>()
			.expect("the looks read back");
		assert_eq!(
			looks,
			vec![
				("c1".to_owned(), "First".to_owned(), None, None),
				("c2".to_owned(), "Second".to_owned(), None, None),
			]
		);
		assert!(
			write(&connection, "UPDATE conversations SET color = 'teal' WHERE id = 'c1'").is_err(),
			"a colour outside the eight reached the file"
		);
		let kept: Option<String> = connection
			.query_row("SELECT color FROM conversations WHERE id = 'c1'", [], |row| row.get(0))
			.expect("the colour reads back");
		assert_eq!(kept, None);
		assert_eq!(
			write(
				&connection,
				"UPDATE conversations SET icon = 'Message', color = 'cyan' WHERE id = 'c1'"
			),
			Ok(1)
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_fresh_file_gives_each_conversation_an_icon_and_a_colour_column() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let looks: (Option<String>, Option<String>) = connection
			.query_row("SELECT icon, color FROM conversations WHERE id = 'c2'", [], |row| {
				Ok((row.get(0)?, row.get(1)?))
			})
			.expect("a fresh conversations table carries icon and color");

		assert_eq!(looks, (None, None));
		assert!(
			write(&connection, "UPDATE conversations SET color = 'teal' WHERE id = 'c2'").is_err(),
			"a colour outside the eight reached a fresh file"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_row_pointing_at_nothing_is_refused() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		let orphan = write(
			&connection,
			"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
				VALUES ('missing', 'missing', 'assistant', 1)",
		);

		assert!(orphan.is_err(), "a participant of no conversation was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_second_row_claiming_the_same_place_is_refused() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let turn = write(
			&connection,
			"INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t3', 'c1', 1, 2)",
		);
		let message = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 1, 'assistant', 'hi', 'complete', 2)",
		);
		let activity = write(
			&connection,
			"INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
				VALUES ('a2', 't1', 'tool', 'pending', '{}', 1, 2)",
		);
		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 1, 'ended', 2)",
		);

		assert!(turn.is_err(), "two turns took the same seq");
		assert!(message.is_err(), "two messages took the same seq");
		assert!(activity.is_err(), "two activities took the same seq in a turn");
		assert!(session.is_err(), "two sessions took the same seq for a participant");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_participant_holds_as_many_live_sessions_as_it_started() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let second_live = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2)",
		);
		let another_bot = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s3', 'c1', 'b2', 'claude-3', 1, 'active', 3)",
		);
		let spent = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at,
					ended_at, rotation_reason)
				VALUES ('s4', 'c1', 'b1', 'claude-4', 3, 'rotated', 4, 5, 'context full')",
		);

		assert!(
			second_live.is_ok(),
			"a second instance of one bot was refused a live session: {second_live:?}"
		);
		assert!(another_bot.is_ok(), "a second bot was refused a session of its own");
		assert!(spent.is_ok(), "a rotated session was refused alongside the live one");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_kept_one_checkpoint_per_bot_keeps_its_rows_and_takes_one_per_session() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(CHECKPOINT_PER_SESSION_STEP))
			.expect("the build that shipped one checkpoint per bot installs");
		connection.execute_batch(&fixture_before_memberships()).expect("the fixture is inserted");
		connection
			.execute_batch(
				"INSERT INTO runtime_sessions
					(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
					VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1),
						('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2);",
			)
			.expect("two instances of one bot");
		write(&connection, A_CHECKPOINT).expect("the checkpoint is inserted");
		let beside_it = a_checkpoint_naming("'s2'", "k2", 1);
		assert!(
			write(&connection, &beside_it).is_err(),
			"the file never held one checkpoint per bot"
		);

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			connection
				.query_row("SELECT summary FROM context_checkpoints WHERE id = 'k1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"the conversation so far",
			"the step dropped a checkpoint the older build had written"
		);
		let admitted = write(&connection, &beside_it);
		assert!(admitted.is_ok(), "a second instance was refused its own checkpoint: {admitted:?}");
		assert!(
			write(&connection, &a_checkpoint_naming("'s2'", "k3", 1)).is_err(),
			"one session took two checkpoints at one message"
		);
		assert!(
			write(&connection, "UPDATE context_checkpoints SET summary = 'else' WHERE id = 'k1'")
				.is_err(),
			"the step left the rewritten row unguarded"
		);
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_forbade_two_live_sessions_lets_them_in_once_it_is_upgraded() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SEVERAL_LIVE_SESSIONS_STEP))
			.expect("the build that shipped the one live session rule installs");
		connection.execute_batch(&fixture_before_memberships()).expect("the fixture is inserted");
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");
		let a_second_instance = "INSERT INTO runtime_sessions
			(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
			VALUES ('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2)";
		assert!(
			write(&connection, a_second_instance).is_err(),
			"the file never held the one live session rule"
		);

		apply(&mut connection).expect("the file comes up to this build");

		let admitted = write(&connection, a_second_instance);
		assert!(admitted.is_ok(), "the upgraded file still holds the rule: {admitted:?}");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_never_reaches_into_another_conversation() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let within = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, replied_to_message_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 'm1', 2, 'assistant', 'hi', 'streaming', 2)",
		);
		let across_reply = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, replied_to_message_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m4', 'c1', 't1', 'm2', 3, 'assistant', 'hi', 'complete', 3)",
		);
		let across_turn = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m5', 'c1', 't2', 4, 'assistant', 'hi', 'complete', 4)",
		);

		assert!(within.is_ok(), "a reply inside its own conversation was refused: {within:?}");
		assert!(across_reply.is_err(), "a message quoted another conversation's message");
		assert!(across_turn.is_err(), "a message was filed under another conversation's turn");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_is_authored_by_a_participant_or_by_no_one() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let outsider = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m3', 'c2', 't2', 'b2', 2, 'assistant', 'hi', 'complete', 2)",
		);
		write(
			&connection,
			"INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('c2', 'b2', 'assistant', 2, 1)",
		)
		.expect("the bot joins the conversation");
		let participant = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m4', 'c2', 't2', 'b2', 3, 'assistant', 'hi', 'complete', 3)",
		);
		connection
			.execute_batch(
				"INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c3', 'topic', 'Third', 1, 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t3', 'c3', 1, 1);",
			)
			.expect("a conversation nobody has joined");
		let unauthored = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m5', 'c3', 't3', 1, 'user', 'hello', 'complete', 1)",
		);

		assert!(outsider.is_err(), "a bot outside the conversation authored a message in it");
		assert!(participant.is_ok(), "a participant's own message was refused: {participant:?}");
		assert!(unauthored.is_ok(), "a message with no bot author was refused: {unauthored:?}");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_runtime_row_only_exists_for_a_participant() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c2', 'b2', 'claude-2', 1, 'active', 2)",
		);
		let checkpoint = write(
			&connection,
			"INSERT INTO context_checkpoints
				(id, conversation_id, bot_id, summary, last_message_seq, token_count, created_at)
				VALUES ('k2', 'c2', 'b2', 'the conversation so far', 1, 120, 2)",
		);
		let for_a_participant = write(&connection, A_CHECKPOINT);

		assert!(session.is_err(), "a bot outside the conversation was given a session in it");
		assert!(checkpoint.is_err(), "a bot outside the conversation was given a checkpoint in it");
		assert!(
			for_a_participant.is_ok(),
			"a participant's own checkpoint was refused: {for_a_participant:?}"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_checkpoint_only_names_its_own_participants_session() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		connection
			.execute_batch(
				"INSERT INTO runtime_sessions
					(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
					VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1),
						('s2', 'c1', 'b2', 'claude-2', 1, 'active', 2),
						('s3', 'c2', 'b1', 'claude-3', 1, 'active', 3);",
			)
			.expect("a session for three participants");

		let another_bot = write(&connection, &a_checkpoint_naming("'s2'", "k2", 2));
		let another_conversation = write(&connection, &a_checkpoint_naming("'s3'", "k3", 3));
		let own_session = write(&connection, A_CHECKPOINT);
		let no_session = write(&connection, &a_checkpoint_naming("NULL", "k4", 4));

		assert!(another_bot.is_err(), "a checkpoint named another bot's run in its conversation");
		assert!(another_conversation.is_err(), "a checkpoint named its bot's run in another one");
		assert!(own_session.is_ok(), "a participant's own run was refused: {own_session:?}");
		assert!(no_session.is_ok(), "a checkpoint outside any run was refused: {no_session:?}");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_state_the_schema_has_no_word_for_is_refused() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let kind = write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c3', 'draft', 'Third', 1, 1)",
		);
		let completion = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 2, 'assistant', 'hi', 'half', 2)",
		);
		let activity = write(
			&connection,
			"INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
				VALUES ('a2', 't1', 'tool', 'halfway', '{}', 2, 2)",
		);
		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 1, 'paused', 2)",
		);

		assert!(kind.is_err(), "a conversation of no known kind was accepted");
		assert!(completion.is_err(), "a message in no known completion state was accepted");
		assert!(activity.is_err(), "an activity in no known status was accepted");
		assert!(session.is_err(), "a session in no known status was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_can_be_stored_cancelled_or_interrupted() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let cancelled = write(&connection, &a_message_ending_in("cancelled", "m3", 2));
		let interrupted = write(&connection, &a_message_ending_in("interrupted", "m4", 3));
		let unknown = write(&connection, &a_message_ending_in("aborted", "m5", 4));

		assert!(cancelled.is_ok(), "a message the user stopped was refused: {cancelled:?}");
		assert!(interrupted.is_ok(), "a message the sweep closed out was refused: {interrupted:?}");
		assert!(unknown.is_err(), "a message in no known completion state was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_stored_checkpoint_cannot_be_rewritten() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");
		write(&connection, A_CHECKPOINT).expect("the checkpoint is inserted");

		for rewrite in [
			"id = 'k2'",
			"conversation_id = 'c2'",
			"bot_id = 'b2'",
			"runtime_session_id = NULL",
			"summary = 'something else'",
			"last_message_seq = 2",
			"token_count = 130",
			"created_at = 2",
		] {
			let refused = write(
				&connection,
				&format!("UPDATE context_checkpoints SET {rewrite} WHERE id = 'k1'"),
			);

			assert!(refused.is_err(), "a stored checkpoint accepted `{rewrite}`");
		}

		assert_eq!(
			connection
				.query_row("SELECT summary FROM context_checkpoints WHERE id = 'k1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"the conversation so far"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
