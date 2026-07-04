import pkg from "pg";
const { Pool } = pkg;

// Debug environment variables
// console.log("=== ENV DEBUG ===");
// console.log("DATABASE_URL exists?", !!process.env.DATABASE_URL);
// console.log(
//   "DATABASE_URL value:",
//   process.env.DATABASE_URL
//     ? process.env.DATABASE_URL.substring(0, 60) + "..."
//     : "NOT FOUND",
// );
// console.log("=================");

console.log(
  "DATABASE_URL from env",
  process.env.DATABASE_URL ? "LOADED" : "NOT LOADED",
);

// initializing the connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// test the connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log("connection to subabase database successful");
    client.release();
    return true;
  } catch (error) {
    console.error("Error connecting to database:", error);
    return false;
  }
};

export default pool;
