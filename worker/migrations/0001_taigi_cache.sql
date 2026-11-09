CREATE TABLE translation_cache (
  key TEXT PRIMARY KEY,
  normalized_zh TEXT NOT NULL,
  taigi_han TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provider_version TEXT NOT NULL
);

CREATE TABLE usage_log (
  created_at TEXT NOT NULL,
  zh_text TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  taigi_han TEXT,
  translation_hit INTEGER NOT NULL CHECK (translation_hit IN (0, 1)),
  tts_hit INTEGER NOT NULL CHECK (tts_hit IN (0, 1)),
  source TEXT NOT NULL CHECK (source IN ('taigi', 'fallback', 'chime'))
);

CREATE INDEX usage_log_created_at_idx ON usage_log(created_at);
CREATE INDEX usage_log_normalized_key_idx ON usage_log(normalized_key);
