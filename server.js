//load environment variables first
import crypto from "crypto";
import "dotenv/config";
import express from "express";

import pool, { testConnection } from "./db/db.js";

const app = express(); //this creates an instance of express

const PORT = process.env.PORT || 3000; //this sets the port to either the environment variable PORT or 3000

// tell express ro parse json bodies for the webhooks, middleware that is used to parse the incoming request body as JSON
app.use(express.json());

testConnection(); //this tests the connection to the database

//webhook routes
app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  // verify signature
  if (!signature) {
    console.log("Missing signature ");
    return res.status(401).send("Unauthorized: Missing signature");
  } else if (!webhookSecret) {
    console.log("Missing webhook secret");
    return res.status(401).send("Unauthorized: Missing webhook secret");
  }
  const hmac = crypto.createHmac("sha256", webhookSecret);
  const digest =
    "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    console.log("❌ Invalid signature");
    return res.status(401).send("Invalid signature");
  }

  console.log("GitHub Webhook Verified!");

  const githubEvent = req.headers["x-github-event"];
  const payload = req.body;

  if (githubEvent === "push") {
    try {
      const repoFullName = payload.repository?.full_name;
      const branch = payload.ref
        ? payload.ref.replace("refs/heads/", "")
        : "unknown";

      // GitHub groups pushes by commits. loop through every commit in this push.
      const commits = payload.commits || [];

      if (commits.length === 0) {
        console.log("Push event contained no commits.");
      }

      for (const commit of commits) {
        const committer =
          commit.author?.username || commit.author?.name || "unknown";
        const commitSha = commit.id;

        // Combine added and modified files into one array of "touched" files
        const touchedFiles = [
          ...(commit.added || []),
          ...(commit.modified || []),
        ];

        console.log(
          `Commit ${commitSha.substring(0, 7)} touched ${touchedFiles.length} file(s).`,
        );

        for (const filePath of touchedFiles) {
          const queryText = `
            INSERT INTO file_touches (repo_full_name, file_path, branch, committer, commit_sha)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (repo_full_name, file_path, branch, commit_sha) DO NOTHING
            RETURNING *;
          `;

          const values = [repoFullName, filePath, branch, committer, commitSha];
          const result = await pool.query(queryText, values);

          if (result.rows.length > 0) {
            console.log(`Logged touch: ${filePath} [${branch}]`);
          } else {
            console.log(`Duplicate ignored: ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error("Error tracking file touches:", error.message);
    }
  }

  res.status(200).send("Webhook handled");
});

//root route
app.get("/", (req, res) => {
  res.send("ConflictGuard server is running");
});
//start the server
//listen to requests that comr from the defined port

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost: ${PORT}`);
});
