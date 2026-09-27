// Talks to the AniList GraphQL API and maps its response shape into the
// plain fields the rest of the app needs, so routes never have to know
// GraphQL exists. No API key is required for these public read queries.

import { decodeHtmlEntities } from "../utils/htmlEntities.js";

const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const REQUEST_TIMEOUT_MS = 8000;

const MEDIA_FIELDS = `
    id
    title {
        english
        native
        romaji
    }
    coverImage {
        large
    }
    description(asHtml: false)
    episodes
    season
    seasonYear
    format
    genres
`;

const SEARCH_QUERY = `
    query ($search: String, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                ${MEDIA_FIELDS}
            }
        }
    }
`;

const BY_ID_QUERY = `
    query ($id: Int) {
        Media(id: $id, type: ANIME) {
            ${MEDIA_FIELDS}
        }
    }
`;

function mapMediaToAnime(media) {
    return {
        anilistId: media.id,
        titleEnglish: media.title?.english ?? null,
        titleNative: media.title?.native ?? null,
        titleRomaji: media.title?.romaji ?? null,
        coverImageUrl: media.coverImage?.large ?? null,
        description: decodeHtmlEntities(media.description) ?? null,
        episodeCount: media.episodes ?? null,
        season: media.season ?? null,
        seasonYear: media.seasonYear ?? null,
        format: media.format ?? null,
        genres: Array.isArray(media.genres) ? media.genres : []
    };
}

async function requestAniList(query, variables) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(ANILIST_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal
        });
    } catch (err) {
        throw new Error(`Could not reach AniList: ${err.message}`);
    } finally {
        clearTimeout(timeoutId);
    }

    if (response.status === 404) {
        // AniList returns a bare 404 (not a GraphQL null) when a single
        // resource, e.g. Media(id: ...), doesn't exist.
        return null;
    }

    if (!response.ok) {
        throw new Error(`AniList responded with status ${response.status}`);
    }

    const payload = await response.json();

    if (payload.errors && payload.errors.length > 0) {
        throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    return payload.data;
}

export async function searchAnime(query, { perPage = 10 } = {}) {
    const data = await requestAniList(SEARCH_QUERY, { search: query, perPage });
    const mediaList = data?.Page?.media ?? [];
    return mediaList.map(mapMediaToAnime);
}

// Fetches one anime by its AniList numeric id. Used when adding an anime,
// so the server (not the client) is the source of truth for its metadata.
export async function getAnimeByAnilistId(anilistId) {
    const data = await requestAniList(BY_ID_QUERY, { id: anilistId });
    return data?.Media ? mapMediaToAnime(data.Media) : null;
}
