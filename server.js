const db = require("./db");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Create tables if not exist and add admin support
(async () => {
  try {
    // ✅ USERS TABLE
    await db.execute(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user'
    )`);

    // ✅ SAFE ALTER (IGNORE ERROR IF COLUMN EXISTS)
    try {
      await db.execute("ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'");
    } catch (err) {}

    // ✅ DELETED USERS TABLE
    await db.execute(`CREATE TABLE IF NOT EXISTS deluser (
      id INT AUTO_INCREMENT PRIMARY KEY,
      old_id INT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // ✅ ORDERS TABLE
    await db.execute(`CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      items JSON NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      user_id INT NOT NULL,
      payment_method VARCHAR(50) DEFAULT 'Netbanking',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // ✅ SAFE ALTER AGAIN
    try {
      await db.execute("ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50) DEFAULT 'Netbanking'");
    } catch (err) {}

    // ✅ ADMIN SEED
    await db.execute(`INSERT INTO users (name, email, password, role)
      SELECT 'Admin', 'tandoori@gmail.com', 'tandoori@123', 'admin'
      FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
    `);

    console.log("✅ Tables ready and admin seed ensured");

  } catch (err) {
    console.error("❌ Table creation error:", err);
  }
})();

/* =========================
   📦 ORDERS ROUTES
========================= */

// ✅ SAVE ORDER (User-based)
app.post("/api/orders", async (req, res) => {
  try {
    const { items, total, user_id, payment_method } = req.body;

    if (!items || !total || !user_id) {
      return res.status(400).json({ error: "Missing data" });
    }

    const method = payment_method || 'Netbanking';

    console.log("👉 Saving Order:", items, total, user_id, "Payment:", method);

    const [result] = await db.execute(
      "INSERT INTO orders (items, total, user_id, payment_method) VALUES (?, ?, ?, ?)",
      [JSON.stringify(items), total, user_id, method]
    );

    console.log("✅ Order Saved:", result);

    res.json({
      message: "Order saved successfully",
      orderId: result.insertId,
      payment_method: method,
    });

  } catch (err) {
    console.error("❌ ERROR Saving Order:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ✅ GET ALL ORDERS (Admin)
app.get("/api/orders", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT * FROM orders ORDER BY id DESC"
    );

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// ✅ GET ORDERS BY USER
app.get("/api/orders/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await db.execute(
      "SELECT id, items, total, user_id, payment_method, created_at FROM orders WHERE user_id = ? ORDER BY id DESC",
      [userId]
    );

    res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user orders" });
  }
});

const requireAdmin = (req, res, next) => {
  const role = req.headers["x-user-role"];
  if (role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// ✅ ADMIN DASHBOARD STATS
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [[{ totalUsers }]] = await db.execute(
      "SELECT COUNT(*) AS totalUsers FROM users"
    );
    const [[{ totalOrders }]] = await db.execute(
      "SELECT COUNT(*) AS totalOrders FROM orders"
    );
    const [[{ totalRevenue }]] = await db.execute(
      "SELECT COALESCE(SUM(total), 0) AS totalRevenue FROM orders"
    );

    res.json({ totalUsers, totalOrders, totalRevenue });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

// ✅ ADMIN GET USERS
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, name, email, role FROM users ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ✅ ADMIN GET ORDERS
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT o.id, o.items, o.total, o.user_id, o.payment_method, o.created_at, u.name AS user_name, u.email AS user_email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      ORDER BY o.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch admin orders" });
  }
});

/* =========================
   👤 AUTH ROUTES
========================= */

// ✅ REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    // check if user exists
    const [existing] = await db.execute(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    await db.execute(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
      [name, email, password]
    );

    console.log("✅ User Registered:", email);

    res.json({ message: "User registered successfully" });

  } catch (err) {
    console.error("❌ Register Error:", err);
    res.status(500).json({ error: "Register failed" });
  }
});

// ✅ LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [rows] = await db.execute(
      "SELECT id, name, email, role FROM users WHERE email = ? AND password = ?",
      [email, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log("✅ User Logged In:", email);

    res.json(rows[0]);

  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ✅ DELETE ACCOUNT (Archive user)
app.post("/api/delete-account", async (req, res) => {
  try {
    const { id, email } = req.body;

    if (!id || !email) {
      return res.status(400).json({ error: "Missing user information" });
    }

    const [rows] = await db.execute(
      "SELECT * FROM users WHERE id = ? AND email = ?",
      [id, email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = rows[0];

    await db.execute(
      "INSERT INTO deluser (old_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
      [
        user.id,
        user.name || "",
        user.email || "",
        user.password || "",
        user.role || "user",
      ]
    );

    await db.execute("DELETE FROM users WHERE id = ?", [user.id]);

    res.json({ message: "Account archived and removed from active users" });
  } catch (err) {
    console.error("❌ Delete Account Error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/* =========================
   🛠️ TEST ROUTE
========================= */

app.get("/", (req, res) => {
  res.send("🚀 Backend is running successfully");
});

/* =========================
   🚀 SERVER START
========================= */

app.listen(PORT, () => {
  console.log(`🔥 Server running on port ${PORT}`);
});