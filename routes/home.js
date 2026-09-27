import { Router } from "express";
import {
    getRecentlyAddedAnime,
    getRecentlyWatchedAnime,
    getTopRatedAnime,
    getLibraryStats,
    getTopGenres
} from "../db/queries/anime.js";

const router = Router();

router.get("/", async (req, res, next) => {
    try {
        const [recentAnime, recentlyWatched, topRated, stats, topGenres] = await Promise.all([
            getRecentlyAddedAnime(5),
            getRecentlyWatchedAnime(5),
            getTopRatedAnime(5),
            getLibraryStats(),
            getTopGenres(5)
        ]);

        res.render("home", {
            title: "Anime Notes",
            recentAnime,
            recentlyWatched,
            topRated,
            stats,
            topGenres
        });
    } catch (err) {
        next(err);
    }
});

export default router;
