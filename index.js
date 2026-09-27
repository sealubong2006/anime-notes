import express from "express";
import "dotenv/config";
import homeRouter from "./routes/home.js";
import animeRouter from "./routes/anime.js";
import db from "./db/pool.js";

const app = express();
const port = process.env.PORT || 3000;

db.connect()
    .then((client) => {
        console.log("Connected to PostgreSQL");
        client.release();
    })
    .catch((err) => {
        console.error("Database connection error:", err);
    });

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use("/", homeRouter);
app.use("/anime", animeRouter);

app.listen(port, () => {
    console.log(`Anime Notes listening on port ${port}`);
});

