-- 001_init.sql
-- Initial schema for Anime Notes: anime catalogue data (AniList-sourced),
-- personal review data, and normalized genres.

CREATE TABLE anime (
    id                BIGSERIAL PRIMARY KEY,
    anilist_id        INTEGER NOT NULL UNIQUE,      -- external API ID: prevents duplicate imports, enables re-sync
    title_english     TEXT,
    title_native      TEXT,
    title_romaji      TEXT,
    cover_image_url   TEXT,
    description       TEXT,
    episode_count     INTEGER,
    season            TEXT CHECK (season IN ('WINTER', 'SPRING', 'SUMMER', 'FALL') OR season IS NULL),
    season_year       SMALLINT,
    format            TEXT,
    source_updated_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anime_title_english ON anime (title_english);
CREATE INDEX idx_anime_season_year   ON anime (season_year);

CREATE TABLE genres (
    id   SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE anime_genres (
    anime_id BIGINT NOT NULL REFERENCES anime(id) ON DELETE CASCADE,
    genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (anime_id, genre_id)
);

CREATE INDEX idx_anime_genres_genre_id ON anime_genres (genre_id);

CREATE TABLE anime_reviews (
    anime_id       BIGINT PRIMARY KEY REFERENCES anime(id) ON DELETE CASCADE,
    overall_rating SMALLINT NOT NULL DEFAULT 5 CHECK (overall_rating BETWEEN 1 AND 10),
    comment        TEXT NOT NULL DEFAULT '',
    date_added     TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_watched   DATE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_anime_reviews_rating ON anime_reviews (overall_rating);
CREATE INDEX idx_anime_reviews_date_added ON anime_reviews (date_added DESC);
