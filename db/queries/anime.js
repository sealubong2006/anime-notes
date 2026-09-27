import pool from "../pool.js";
import { decodeHtmlEntities } from "../../utils/htmlEntities.js";

// Safety net for rows inserted before description decoding was added at the
// AniList service boundary — decoding an already-clean string is a no-op,
// so this is safe to apply unconditionally to every row.
function withDecodedDescription(row) {
    if (!row) {
        return row;
    }
    return { ...row, description: decodeHtmlEntities(row.description) };
}

// Shared SELECT/FROM used by every list-style query (home, browse). Each
// anime's genres are aggregated into an array so cards can display them
// without a separate query per anime.
const LIST_SELECT = `
    a.id,
    a.title_english   AS "titleEnglish",
    a.title_romaji    AS "titleRomaji",
    a.cover_image_url AS "coverImageUrl",
    a.description,
    r.overall_rating  AS "overallRating",
    r.comment,
    r.date_added      AS "dateAdded",
    COALESCE(array_agg(g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
`;

const LIST_FROM = `
    FROM anime a
    JOIN anime_reviews r ON r.anime_id = a.id
    LEFT JOIN anime_genres ag ON ag.anime_id = a.id
    LEFT JOIN genres g ON g.id = ag.genre_id
`;

const LIST_GROUP_BY = "GROUP BY a.id, r.anime_id";

const SORT_ORDER_BY = {
    recent: "r.date_added DESC",
    rating: "r.overall_rating DESC, r.date_added DESC",
    title: "COALESCE(a.title_english, a.title_romaji) ASC"
};

// Browse page size. Single source of truth — change here to change it everywhere.
export const PAGE_SIZE = 12;

export async function getRecentlyAddedAnime(limit) {
    const result = await pool.query(
        `SELECT ${LIST_SELECT}
         ${LIST_FROM}
         ${LIST_GROUP_BY}
         ORDER BY ${SORT_ORDER_BY.recent}
         LIMIT $1`,
        [limit]
    );
    return result.rows.map(withDecodedDescription);
}

export async function getRecentlyWatchedAnime(limit) {
    const result = await pool.query(
        `SELECT ${LIST_SELECT}
         ${LIST_FROM}
         WHERE r.date_watched IS NOT NULL
         ${LIST_GROUP_BY}
         ORDER BY r.date_watched DESC
         LIMIT $1`,
        [limit]
    );
    return result.rows.map(withDecodedDescription);
}

export async function getTopRatedAnime(limit) {
    const result = await pool.query(
        `SELECT ${LIST_SELECT}
         ${LIST_FROM}
         ${LIST_GROUP_BY}
         ORDER BY ${SORT_ORDER_BY.rating}
         LIMIT $1`,
        [limit]
    );
    return result.rows.map(withDecodedDescription);
}

// count(column) ignores NULLs, so this gets total + watched in one query.
export async function getLibraryStats() {
    const result = await pool.query(
        `SELECT
            count(*)::int AS total,
            count(date_watched)::int AS watched
         FROM anime_reviews`
    );
    return result.rows[0];
}

export async function getTopGenres(limit) {
    const result = await pool.query(
        `SELECT g.name, count(*)::int AS "animeCount"
         FROM anime_genres ag
         JOIN genres g ON g.id = ag.genre_id
         GROUP BY g.name
         ORDER BY "animeCount" DESC, g.name ASC
         LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// Builds the browse-page WHERE clause from whichever filters are present,
// then runs a count query followed by the paginated row query so both
// share the same filter logic. `genreId` and `minRating` are expected to
// already be validated (numeric, in-range) or null by the caller —
// invalid/absent filters are simply left out of the WHERE clause rather
// than erroring. `page` is clamped to the real page range here, after the
// count is known, so an out-of-range page can never produce a broken or
// empty-looking result when valid pages exist.
export async function getFilteredAnime({ search, genreId, minRating, sort, page }) {
    const conditions = [];
    const params = [];

    if (search) {
        params.push(`%${search}%`);
        const placeholder = `$${params.length}`;
        conditions.push(
            `(a.title_english ILIKE ${placeholder} OR a.title_native ILIKE ${placeholder} OR a.title_romaji ILIKE ${placeholder})`
        );
    }

    if (genreId !== null) {
        params.push(genreId);
        conditions.push(`a.id IN (SELECT anime_id FROM anime_genres WHERE genre_id = $${params.length})`);
    }

    if (minRating !== null) {
        params.push(minRating);
        conditions.push(`r.overall_rating >= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = SORT_ORDER_BY[sort] || SORT_ORDER_BY.recent;

    const countResult = await pool.query(
        `SELECT count(*)::int AS total
         FROM anime a
         JOIN anime_reviews r ON r.anime_id = a.id
         ${where}`,
        params
    );
    const totalCount = countResult.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const offset = (currentPage - 1) * PAGE_SIZE;

    const rowParams = [...params, PAGE_SIZE, offset];
    const result = await pool.query(
        `SELECT ${LIST_SELECT}
         ${LIST_FROM}
         ${where}
         ${LIST_GROUP_BY}
         ORDER BY ${orderBy}
         LIMIT $${rowParams.length - 1}
         OFFSET $${rowParams.length}`,
        rowParams
    );

    return {
        rows: result.rows.map(withDecodedDescription),
        totalCount,
        totalPages,
        page: currentPage
    };
}

export async function getAllGenres() {
    const result = await pool.query(`SELECT id, name FROM genres ORDER BY name`);
    return result.rows;
}

export async function getAnimeById(id) {
    const result = await pool.query(
        `SELECT
            a.id,
            a.anilist_id      AS "anilistId",
            a.title_english   AS "titleEnglish",
            a.title_native    AS "titleNative",
            a.title_romaji    AS "titleRomaji",
            a.cover_image_url AS "coverImageUrl",
            a.description,
            a.episode_count   AS "episodeCount",
            a.season,
            a.season_year     AS "seasonYear",
            a.format,
            r.overall_rating  AS "overallRating",
            r.comment,
            to_char(r.date_added, 'DD Mon YYYY') AS "dateAdded",
            to_char(r.date_watched, 'YYYY-MM-DD') AS "dateWatched",
            COALESCE(array_agg(g.name) FILTER (WHERE g.name IS NOT NULL), '{}') AS genres
         FROM anime a
         JOIN anime_reviews r ON r.anime_id = a.id
         LEFT JOIN anime_genres ag ON ag.anime_id = a.id
         LEFT JOIN genres g ON g.id = ag.genre_id
         WHERE a.id = $1
         GROUP BY a.id, r.anime_id`,
        [id]
    );
    return withDecodedDescription(result.rows[0] || null);
}

export async function clearAnimeDateWatched(animeId) {
    const result = await pool.query(
        `UPDATE anime_reviews SET date_watched = NULL, updated_at = now() WHERE anime_id = $1`,
        [animeId]
    );
    return result.rowCount > 0;
}

export async function updateAnimeReview(animeId, { overallRating, comment, dateWatched }) {
    const result = await pool.query(
        `UPDATE anime_reviews
         SET overall_rating = $1,
             comment = $2,
             date_watched = $3,
             updated_at = now()
         WHERE anime_id = $4`,
        [overallRating, comment, dateWatched, animeId]
    );
    return result.rowCount > 0;
}

export async function findAnimeIdByAnilistId(anilistId) {
    const result = await pool.query(
        `SELECT id FROM anime WHERE anilist_id = $1`,
        [anilistId]
    );
    return result.rows[0]?.id ?? null;
}

async function upsertGenreId(client, name) {
    const inserted = await client.query(
        `INSERT INTO genres (name) VALUES ($1)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [name]
    );
    if (inserted.rows[0]) {
        return inserted.rows[0].id;
    }
    const existing = await client.query(`SELECT id FROM genres WHERE name = $1`, [name]);
    return existing.rows[0].id;
}

// Inserts an anime (sourced from AniList) plus its genres and a default
// personal review, all inside one transaction. If the AniList ID already
// exists, the transaction is rolled back and the existing local id is
// returned instead of creating a duplicate.
export async function insertAnimeFromAniList({
    anilistId,
    titleEnglish,
    titleNative,
    titleRomaji,
    coverImageUrl,
    description,
    episodeCount,
    season,
    seasonYear,
    format,
    genres
}) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const existing = await client.query(
            `SELECT id FROM anime WHERE anilist_id = $1`,
            [anilistId]
        );
        if (existing.rows[0]) {
            await client.query("ROLLBACK");
            return { id: existing.rows[0].id, created: false };
        }

        const insertedAnime = await client.query(
            `INSERT INTO anime (
                anilist_id, title_english, title_native, title_romaji,
                cover_image_url, description, episode_count, season, season_year, format
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [anilistId, titleEnglish, titleNative, titleRomaji, coverImageUrl,
                description, episodeCount, season, seasonYear, format]
        );
        const animeId = insertedAnime.rows[0].id;

        for (const genreName of genres) {
            const genreId = await upsertGenreId(client, genreName);
            await client.query(
                `INSERT INTO anime_genres (anime_id, genre_id) VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [animeId, genreId]
            );
        }

        await client.query(
            `INSERT INTO anime_reviews (anime_id, overall_rating, comment, date_added, date_watched)
             VALUES ($1, 5, '', now(), NULL)`,
            [animeId]
        );

        await client.query("COMMIT");
        return { id: animeId, created: true };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
