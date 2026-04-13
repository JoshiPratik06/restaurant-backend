const mysql = require("mysql2/promise");

// Create connection pool using Railway DATABASE_URL
const db = mysql.createPool(process.env.DATABASE_URL);

// Optional: test connection (recommended)
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("✅ MySQL Connected Successfully");
    connection.release();
  } catch (err) {
    console.error("❌ MySQL Connection Failed:", err);
  }
})();

module.exports = db;