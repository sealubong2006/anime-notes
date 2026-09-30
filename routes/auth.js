import { Router } from "express";
import bcrypt from "bcryptjs";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "../middleware/loginRateLimiter.js";

const router = Router();

router.get("/login", (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.redirect("/");
    }
    res.render("login", { title: "Login", error: null });
});

router.post("/login", async (req, res, next) => {
    const ip = req.ip;

    if (isRateLimited(ip)) {
        return res.status(429).render("login", {
            title: "Login",
            error: "Too many failed attempts. Please try again in a few minutes."
        });
    }

    const password = typeof req.body.password === "string" ? req.body.password : "";
    const hash = process.env.ADMIN_PASSWORD_HASH;

    if (!hash) {
        console.error("ADMIN_PASSWORD_HASH is not set — login is unavailable.");
        return res.status(500).render("error", {
            title: "Login Unavailable",
            message: "Login is not configured on this server."
        });
    }

    try {
        const valid = password !== "" && await bcrypt.compare(password, hash);

        if (!valid) {
            recordFailedAttempt(ip);
            return res.status(401).render("login", { title: "Login", error: "Incorrect password." });
        }

        clearAttempts(ip);

        req.session.regenerate((err) => {
            if (err) {
                return next(err);
            }
            req.session.isAdmin = true;
            res.redirect("/");
        });
    } catch (err) {
        next(err);
    }
});

router.post("/logout", (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            return next(err);
        }
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

export default router;
