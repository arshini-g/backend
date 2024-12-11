require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const mysql = require("mysql");
const { Pool } = require("pg");

// CockroachDB Pool
const cockroachPool = new Pool({
    user: process.env.COCKROACH_USER,
    host: process.env.COCKROACH_HOST,
    database: process.env.COCKROACH_DATABASE,
    password: process.env.COCKROACH_PASSWORD,
    port: process.env.COCKROACH_PORT,
    ssl: {
        rejectUnauthorized: process.env.COCKROACH_SSL_REJECT_UNAUTHORIZED === "true",
    },
});

cockroachPool.query("SELECT NOW()", (err, res) => {
    if (err) {
        console.error("Error connecting to CockroachDB:", err);
    } else {
        console .log("Connected to CockroachDB");

    }
});

// Supabase Pool
const supabasePool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: {
        rejectUnauthorized: process.env.SUPABASE_SSL_REJECT_UNAUTHORIZED === "true",
    },
});

supabasePool.query("SELECT NOW()", (err, res) => {
    if (err) {
        console.error("Error connecting to Supabase:", err);
    } else {
        console.log("Connected to Supabase");
    }
}
);


app.use(require("cors")({
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'], 
  allowedHeaders: ['Content-Type'], 
}));
app.use(bodyParser.json());

app.get("/check-user", (req, res) => {
  const userId = req.query.user_id;

  if (!userId) {
    return res.status(400).send("User ID not provided in query parameters.");
  }

  const getUsernameQuery = "SELECT username FROM users_login WHERE id = $1";

  cockroachPool.query(getUsernameQuery, [userId], (cockroachErr, cockroachResult) => {
    if (cockroachErr) {
      console.error("Error querying CockroachDB:", cockroachErr);
      return res.status(500).send("Database error while fetching username from CockroachDB.");
    }

    if (cockroachResult.rows.length > 0) {
      const username = cockroachResult.rows[0].username;

      const checkUserQuerySupabase = "SELECT * FROM users WHERE user_id = $1";

      supabasePool.query(checkUserQuerySupabase, [userId], (supabaseCheckErr, supabaseResult) => {
        if (supabaseCheckErr) {
          console.error("Error checking user existence in Supabase:", supabaseCheckErr);
          return res.status(500).send("Database error while checking user existence.");
        }

        if (supabaseResult.rows.length > 0) {
          const getTasksQuery = "SELECT * FROM tasks WHERE user_id = $1";

          supabasePool.query(getTasksQuery, [userId], (supabaseErr, tasksResult) => {
            if (supabaseErr) {
              console.error("Error querying Supabase for tasks:", supabaseErr);
              return res.status(500).send("Database error while fetching tasks.");
            }

            const tasks = tasksResult.rows || [];
            return res.json({
              message: `Welcome back, ${username}!`,
              userId,
              tasks,
              username
            });
          });
        } else {
          const insertUserQuery = "INSERT INTO users (user_id, username) VALUES ($1, $2)";

          supabasePool.query(insertUserQuery, [userId, username], (supabaseInsertErr) => {
            if (supabaseInsertErr) {
              console.error("Error inserting new user into Supabase:", supabaseInsertErr);
              return res.status(500).send("Error inserting new user.");
            }

            return res.json({
              message: `Welcome, new user ${userId}!`,
              userId,
              username,
              tasks: []
            });
          });
        }
      });
    } else {
      return res.status(404).send("User ID does not exist in CockroachDB.");
    }
  });
});

app.get("/tasks", (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).send("User ID is required");
  }

  supabasePool.query("SELECT * FROM tasks WHERE user_id = $1", [userId], (err, results) => {
    if (err) {
      console.error("Error fetching tasks from Supabase:", err);
      return res.status(500).send("Error fetching tasks");
    }
    res.json(results.rows || []);
  });
});

app.post("/tasks", (req, res) => {
  const { taskTitle, taskDescription, userId } = req.body;

  if (!taskTitle || !userId) {
    return res.status(400).send("Task title and user ID are required");
  }

  const query = `
    INSERT INTO tasks (task_title, task_description, status, user_id) 
    VALUES ($1, $2, $3, $4)
  `;
  const params = [taskTitle, taskDescription || null, "pending", userId];

  supabasePool.query(query, params, (err) => {
    if (err) {
      console.error("Error adding task to Supabase:", err);
      return res.status(500).send("Error adding task");
    }
    res.status(201).send("Task added successfully");
  });
});

app.put("/tasks/:task_id", (req, res) => {
  const taskId = req.params.task_id;
  const { status } = req.body;

  if (!taskId || !status) {
    return res.status(400).send("Task ID and status are required");
  }

  const query = "UPDATE tasks SET status = $1 WHERE task_id = $2";
  const params = [status, taskId];

  supabasePool.query(query, params, (err, result) => {
    if (err) {
      console.error("Error updating task in Supabase:", err);
      return res.status(500).send("Error updating task");
    }
    if (result.rowCount === 0) {
      return res.status(404).send("Task not found");
    }
    res.send("Task status updated successfully");
  });
});

app.put("/tasks/edit/:task_id", (req, res) => {
  const taskId = req.params.task_id;
  const { taskTitle, taskDescription } = req.body;

  if (!taskId || (!taskTitle && !taskDescription)) {
    return res.status(400).send("Task ID and at least one of task title or description are required");
  }

  let query = "UPDATE tasks SET ";
  const params = [];

  if (taskTitle) {
    query += "task_title = $1";
    params.push(taskTitle);
  }
  if (taskDescription) {
    if (params.length > 0) query += ", ";
    query += "task_description = $2";
    params.push(taskDescription);
  }

  query += " WHERE task_id = $" + (params.length + 1);
  params.push(taskId);

  supabasePool.query(query, params, (err, result) => {
    if (err) {
      console.error("Error updating task in Supabase:", err);
      return res.status(500).send("Error updating task");
    }
    if (result.rowCount === 0) {
      return res.status(404).send("Task not found");
    }
    res.send("Task updated successfully");
  });
});

// Delete a task
app.delete("/tasks/:task_id", (req, res) => {
  const taskId = req.params.task_id;

  if (!taskId) {
    return res.status(400).send("Task ID is required");
  }

  const query = "DELETE FROM tasks WHERE task_id = $1";
  const params = [taskId];

  supabasePool.query(query, params, (err, result) => {
    if (err) {
      console.error("Error deleting task from supabaseDB:", err);
      return res.status(500).send("Error deleting task");
    }
    if (result.rowCount === 0) {
      return res.status(404).send("Task not found");
    }
    res.send("Task deleted successfully");
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

