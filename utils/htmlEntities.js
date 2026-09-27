// Decodes a small, safe set of HTML entities (named + numeric) into their
// literal characters. This does NOT parse or strip HTML tags — a decoded
// "&lt;br&gt;" becomes the literal text "<br>", which EJS's normal escaping
// then re-encodes for safe display (visible as "<br>" text, never an actual
// line break). That is intentional: callers must never render this output
// with `<%- %>`.

const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
};

const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;

export function decodeHtmlEntities(text) {
    if (typeof text !== "string" || text === "") {
        return text;
    }

    return text.replace(ENTITY_PATTERN, (match, entity) => {
        if (entity[0] === "#") {
            const isHex = entity[1] === "x" || entity[1] === "X";
            const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
            return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }

        const lower = entity.toLowerCase();
        return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, lower) ? NAMED_ENTITIES[lower] : match;
    });
}
