import "dotenv/config"; // Load environment variables
import express from "express";
import crypto from "crypto";
import pool, { testConnection } from "./db/db.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Main webhook receiver
app.post("/webhook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.log("Missing signature or secret");
    return res.status(401).send("Unauthorized");
  }

  const hmac = crypto.createHmac("sha256", webhookSecret);
  const digest =
    "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
    console.log("Invalid signature");
    return res.status(401).send("Invalid signature");
  }

  const githubEvent = req.headers["x-github-event"];
  const payload = req.body;
  const repoFullName = payload.repository?.full_name;

  console.log(`Received GitHub Event: [${githubEvent}] for ${repoFullName}`);

  try {
    // Route to the appropriate handler based on the event type
    switch (githubEvent) {
      case "push":
        await handlePushEvent(payload, repoFullName);
        break;

      case "pull_request":
        await handlePullRequestEvent(payload, repoFullName);
        break;

      case "delete":
        await handleBranchDeleteEvent(payload, repoFullName);
        break;

      default:
        console.log(`Unhandled event type: ${githubEvent}. Payload skipped.`);
    }
  } catch (error) {
    console.error(`Error processing event [${githubEvent}]:`, error.message);
  }

  res.status(200).send("Webhook event received");
});

// Process push events and log individual file changes
async function handlePushEvent(payload, repoFullName) {
  const branch = payload.ref
    ? payload.ref.replace("refs/heads/", "")
    : "unknown";
  const commits = payload.commits || [];

  if (commits.length === 0) {
    console.log("Push event contained no commits.");
    return;
  }

  for (const commit of commits) {
    const committer =
      commit.author?.username || commit.author?.name || "unknown";
    const commitSha = commit.id;
    const touchedFiles = [...(commit.added || []), ...(commit.modified || [])];

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
        console.log(`Logged touch: ${filePath} on branch [${branch}]`);
      } else {
        console.log(`Duplicate ignored: ${filePath}`);
      }
    }
  }
}

// Process pull requests for potential branch conflicts
async function handlePullRequestEvent(payload, repoFullName) {
  const action = payload.action;
  const prNumber = payload.number;
  const sourceBranch = payload.pull_request?.head?.ref;
  const targetBranch = payload.pull_request?.base?.ref;
  const user = payload.pull_request?.user?.login;

  console.log(
    `PR #${prNumber} ${action} by ${user} (${sourceBranch} -> ${targetBranch})`,
  );

  if (action === "opened" || action === "synchronize") {
    console.log(`Analyzing potential overlaps for PR #${prNumber}...`);
  }
}

// Clean up database records when a branch is deleted
async function handleBranchDeleteEvent(payload, repoFullName) {
  if (payload.ref_type === "branch") {
    const deletedBranch = payload.ref;
    console.log(
      `Branch [${deletedBranch}] deleted from ${repoFullName}. Cleaning up active tracking files...`,
    );

    const result = await pool.query(
      `
      DELETE FROM file_touches 
      WHERE repo_full_name = $1 AND branch = $2;
    `,
      [repoFullName, deletedBranch],
    );

    console.log(
      `Cleared ${result.rowCount} rows from database for deleted branch.`,
    );
  }
}

// Start local server and test database connectivity
app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  await testConnection();
});
