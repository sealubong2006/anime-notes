// The single point of enforcement for every admin-only route. Views may also
// hide admin controls for a logged-out visitor, but that's cosmetic — this
// middleware is what actually rejects the request before any handler (and
// therefore any database write) runs.
export default function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.redirect("/login");
}
