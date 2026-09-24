import express from "express";
import bodyParser from "body-parser";
import "dotenv/config";
import pg from "pg";

const app = express();
const port = process.env.PORT || 3000;

const { Pool } = pg;

const db = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

db.connect()
    .then((client) => {
        console.log("Connected to PostgreSQL");
        client.release();
    })
    .catch((err) => {
        console.error("Database connection error:", err);
    });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

