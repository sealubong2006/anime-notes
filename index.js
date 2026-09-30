import express from "express";
import "dotenv/config";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import homeRouter from "./routes/home.js";
import animeRouter from "./routes/anime.js";
import authRouter from "./routes/auth.js";
import db from "./db/pool.js";

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Fail fast with a clear message rather than a confusing runtime error deep
// inside express-session or bcrypt if these are missing in production.
if (isProduction) {
    const missing = ["DATABASE_URL", "SESSION_SECRET", "ADMIN_PASSWORD_HASH"]
        .filter((name) => !process.env[name]);
    if (missing.length > 0) {
        console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
        process.exit(1);
    }
}

db.connect()
    .then((client) => {
        console.log("Connected to PostgreSQL");
        client.release();
    })
    .catch((err) => {
        console.error("Database connection error:", err);
    });

// Needed in production so Express trusts the X-Forwarded-Proto header from
// the platform's reverse proxy — otherwise it can never tell the original
// request was HTTPS, and secure cookies would never get sent.
if (isProduction) {
    app.set("trust proxy", 1);
}

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const PgSession = connectPgSimple(session);

app.use(session({
    store: new PgSession({ pool: db, tableName: "session" }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
}));

// Makes `isAdmin` available to every view from one place, so templates can
// decide what to show without any route having to remember to pass it. This
// is display-only — the real enforcement is requireAdmin on each route.
app.use((req, res, next) => {
    res.locals.isAdmin = !!(req.session && req.session.isAdmin);
    next();
});

app.use("/", homeRouter);
app.use("/", authRouter);
app.use("/anime", animeRouter);

// Catch-all for any path that didn't match a route above.
app.use((req, res) => {
    res.status(404).render("error", {
        title: "Page Not Found",
        message: "That page doesn't exist. Check the address, or head back to the homepage."
    });
});

// Final safety net for anything an individual route didn't already handle
// (e.g. a dropped database connection, an unexpected bug). The real error
// is always logged server-side; the browser only ever sees a generic
// message, never a stack trace or database/API details.
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).render("error", {
        title: "Something Went Wrong",
        message: "An unexpected error occurred. Please try again in a moment."
    });
});

app.listen(port, () => {
    console.log(`Anime Notes listening on port ${port}`);
});

