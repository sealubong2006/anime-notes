import { Router } from "express";
import {
    getAnimeById,
    getFilteredAnime,
    getAllGenres,
    updateAnimeReview,
    clearAnimeDateWatched,
    findAnimeIdByAnilistId,
    insertAnimeFromAniList
} from "../db/queries/anime.js";
import { searchAnime, getAnimeByAnilistId } from "../services/anilistService.js";
import requireAdmin from "../middleware/requireAdmin.js";

// Capped at 18 digits so an oversized numeric string can never be sent to
// Postgres as a BIGINT literal (max ~9.2e18, 19 digits) — without this, an
// overlong id would fail ID_PATTERN's old unbounded check, reach the query,
// and surface as an uncaught overflow error (500) instead of a clean 404.
const ID_PATTERN = /^\d{1,18}$/;
const UNIQUE_VIOLATION = "23505";
const SORT_VALUES = new Set(["recent", "rating", "title"]);

function isPostgresDateError(err) {
    return err.code === "22007" || err.code === "22008" || err.code === "22P02";
}

function renderNotFound(res, view = "anime/show") {
    return res.status(404).render(view, { title: "Anime Not Found", anime: null });
}

function toNullableInt(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : null;
}

const router = Router();

router.get("/", async (req, res, next) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const genreId = toNullableInt(req.query.genre);

    const parsedMinRating = toNullableInt(req.query.minRating);
    const minRating = parsedMinRating !== null && parsedMinRating >= 1 && parsedMinRating <= 10
        ? parsedMinRating
        : null;

    const sort = SORT_VALUES.has(req.query.sort) ? req.query.sort : "recent";

    const parsedPage = toNullableInt(req.query.page);
    const requestedPage = parsedPage !== null && parsedPage >= 1 ? parsedPage : 1;

    try {
        const [{ rows: animeList, totalCount, totalPages, page }, genreOptions] = await Promise.all([
            getFilteredAnime({
                search: search !== "" ? search : null,
                genreId,
                minRating,
                sort,
                page: requestedPage
            }),
            getAllGenres()
        ]);

        res.render("anime/index", {
            title: "Browse Anime",
            animeList,
            genreOptions,
            filters: { search, genreId, minRating, sort },
            pagination: { page, totalPages, totalCount }
        });
    } catch (err) {
        next(err);
    }
});

router.get("/add", requireAdmin, (req, res) => {
    res.render("anime/add", { title: "Add Anime", query: "", results: null, error: null });
});

router.get("/add/search", requireAdmin, async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (query === "") {
        return res.status(400).render("anime/add", {
            title: "Add Anime",
            query: "",
            results: null,
            error: "Enter a title to search for."
        });
    }

    try {
        const results = await searchAnime(query);
        res.render("anime/add", { title: "Add Anime", query, results, error: null });
    } catch (err) {
        console.error("AniList search failed:", err.message);
        res.status(502).render("anime/add", {
            title: "Add Anime",
            query,
            results: null,
            error: "Could not reach AniList right now — please try again in a moment."
        });
    }
});

router.get("/add/preview", requireAdmin, async (req, res, next) => {
    const anilistId = toNullableInt(req.query.anilistId);

    if (anilistId === null) {
        return res.status(400).render("anime/add", {
            title: "Add Anime",
            query: "",
            results: null,
            error: "Invalid AniList selection — please search again."
        });
    }

    try {
        const existingId = await findAnimeIdByAnilistId(anilistId);
        if (existingId) {
            return res.redirect(`/anime/${existingId}?alreadyAdded=1`);
        }
    } catch (err) {
        return next(err);
    }

    let animeData;
    try {
        animeData = await getAnimeByAnilistId(anilistId);
    } catch (err) {
        console.error("AniList lookup failed during preview:", err.message);
        return res.status(502).render("anime/add-preview", {
            title: "Add Anime",
            anime: null,
            error: "Could not reach AniList right now — please try again in a moment."
        });
    }

    if (!animeData) {
        return res.status(404).render("anime/add-preview", {
            title: "Add Anime",
            anime: null,
            error: "That anime could not be found on AniList — please search again."
        });
    }

    res.render("anime/add-preview", { title: "Confirm Add", anime: animeData, error: null });
});

router.post("/", requireAdmin, async (req, res, next) => {
    const anilistId = toNullableInt(req.body.anilistId);

    if (anilistId === null) {
        return res.status(400).render("anime/add", {
            title: "Add Anime",
            query: "",
            results: null,
            error: "Invalid AniList selection — please search again."
        });
    }

    let animeData;
    try {
        animeData = await getAnimeByAnilistId(anilistId);
    } catch (err) {
        console.error("AniList lookup failed during add:", err.message);
        return res.status(502).render("anime/add", {
            title: "Add Anime",
            query: "",
            results: null,
            error: "Could not reach AniList right now — please try again in a moment."
        });
    }

    if (!animeData) {
        return res.status(404).render("anime/add", {
            title: "Add Anime",
            query: "",
            results: null,
            error: "That anime could not be found on AniList — please search again."
        });
    }

    try {
        const { id, created } = await insertAnimeFromAniList(animeData);
        return res.redirect(created ? `/anime/${id}` : `/anime/${id}?alreadyAdded=1`);
    } catch (err) {
        if (err.code === UNIQUE_VIOLATION) {
            const existingId = await findAnimeIdByAnilistId(anilistId);
            if (existingId) {
                return res.redirect(`/anime/${existingId}?alreadyAdded=1`);
            }
        }
        next(err);
    }
});

router.get("/:id", async (req, res, next) => {
    if (!ID_PATTERN.test(req.params.id)) {
        return renderNotFound(res, "anime/show");
    }

    try {
        const anime = await getAnimeById(req.params.id);
        if (!anime) {
            return renderNotFound(res, "anime/show");
        }
        res.render("anime/show", {
            title: anime.titleEnglish,
            anime,
            alreadyAdded: req.query.alreadyAdded === "1"
        });
    } catch (err) {
        next(err);
    }
});

router.get("/:id/edit", requireAdmin, async (req, res, next) => {
    if (!ID_PATTERN.test(req.params.id)) {
        return renderNotFound(res, "anime/edit");
    }

    try {
        const anime = await getAnimeById(req.params.id);
        if (!anime) {
            return renderNotFound(res, "anime/edit");
        }
        res.render("anime/edit", { title: `Edit Review — ${anime.titleEnglish}`, anime, errors: null });
    } catch (err) {
        next(err);
    }
});

router.post("/:id/edit", requireAdmin, async (req, res, next) => {
    if (!ID_PATTERN.test(req.params.id)) {
        return renderNotFound(res, "anime/edit");
    }

    const { id } = req.params;

    try {
        const anime = await getAnimeById(id);
        if (!anime) {
            return renderNotFound(res, "anime/edit");
        }

        if (req.body.action === "clearDateWatched") {
            await clearAnimeDateWatched(id);
            return res.redirect(`/anime/${id}`);
        }

        const { overallRating, comment, dateWatched } = req.body;
        const errors = [];

        const ratingNumber = Number(overallRating);
        if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 10) {
            errors.push("Rating must be a whole number between 1 and 10.");
        }

        const commentValue = typeof comment === "string" ? comment : "";

        const dateWatchedTrimmed = typeof dateWatched === "string" ? dateWatched.trim() : "";
        let dateWatchedValue = null;
        if (dateWatchedTrimmed !== "") {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateWatchedTrimmed)) {
                errors.push("Date watched must be a valid date.");
            } else {
                dateWatchedValue = dateWatchedTrimmed;
            }
        }

        if (errors.length > 0) {
            return res.status(400).render("anime/edit", {
                title: `Edit Review — ${anime.titleEnglish}`,
                anime: {
                    ...anime,
                    overallRating,
                    comment: commentValue,
                    dateWatched: dateWatchedTrimmed
                },
                errors
            });
        }

        try {
            await updateAnimeReview(id, {
                overallRating: ratingNumber,
                comment: commentValue,
                dateWatched: dateWatchedValue
            });
        } catch (err) {
            if (isPostgresDateError(err)) {
                return res.status(400).render("anime/edit", {
                    title: `Edit Review — ${anime.titleEnglish}`,
                    anime: {
                        ...anime,
                        overallRating,
                        comment: commentValue,
                        dateWatched: dateWatchedTrimmed
                    },
                    errors: ["Date watched must be a valid date."]
                });
            }
            throw err;
        }

        res.redirect(`/anime/${id}`);
    } catch (err) {
        next(err);
    }
});

export default router;
