const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "restaurant_db",
});

console.log("✅ MySQL Pool Ready");

module.exports = db;