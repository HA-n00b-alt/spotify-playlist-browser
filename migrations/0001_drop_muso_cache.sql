-- Drop the Muso cache tables left behind by the Muso removal (ADR 0002, #15).
-- Nothing reads or writes them since 09cac96; production last touched them on 2026-06-07.
DROP INDEX IF EXISTS idx_muso_track_cache_isrcs_gin;
DROP TABLE IF EXISTS muso_track_cache;
DROP TABLE IF EXISTS muso_album_cache;
