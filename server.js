require("dotenv").config();
const path = require("path");
const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3006;

const completedFile =
  process.env.FILE_PATH || path.join(__dirname, "completed.json");

const rulesTemplate = {
  rule: { text: 'Mark as "completed" when ready.', completed: false },
  status: "pending",
  lastUpdated: new Date().toISOString()
};

fs.writeFileSync(completedFile, JSON.stringify(rulesTemplate, null, 2), "utf8");

app.get("/", (req, res) => {
  res.send("Hello from Express!");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Completed file path: ${completedFile}`);
});

let lastStoppedPid = null;

function stopLatestCursor() {
  const cmd = `ps -eo pid,ppid,comm,lstart,etime | grep -i "cursor" | grep -v grep | sort -k6,7 | tail -n 1`;
  exec(cmd, (err, stdout) => {
    if (err) {
      console.error("❌ Error finding cursor process:", err.message);
      return;
    }
    const processInfo = stdout.trim();
    if (processInfo) {
      const pid = processInfo.split(/\s+/)[0]; // first column is PID
      lastStoppedPid = pid; // save PID
      console.log("🔎 Latest cursor process details:");
      console.log(processInfo);

      console.log(`\n⏸️ Stopping cursor process with PID: ${pid}`);
      exec(`kill -9 ${pid}`, (stopErr) => {
        if (stopErr) {
          console.error("❌ Failed to stop cursor process:", stopErr.message);
        } else {
          console.log(`✅ Cursor process ${pid} stopped (paused).`);
          console.log(`👉 Press 'c' in this terminal to resume it.`);

          let data = JSON.parse(fs.readFileSync(completedFile, "utf8"));
          data.status = "stopped";
          data.rule.completed = false; 
          data.lastStoppedProcess = {
            pid,
            details: processInfo,
            stoppedAt: new Date().toISOString()
          };
          data.lastUpdated = new Date().toISOString();

          fs.writeFileSync(completedFile, JSON.stringify(data, null, 2), "utf8");
        }
      });
    } else {
      console.log("⚠️ No cursor process found to stop.");
    }
  });
}

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  
  process.stdin.on("data", (key) => {
    if (key === "c") {
      if (lastStoppedPid) {
        console.log(`▶️ Resuming cursor process with PID: ${lastStoppedPid}`);
        exec(`kill -CONT ${lastStoppedPid}`, (err) => {
          if (err) {
            console.error("❌ Failed to resume cursor process:", err.message);
          } else {
            console.log(`✅ Cursor process ${lastStoppedPid} resumed successfully.`);
          }
        });
      } else {
        console.log("⚠️ No cursor process has been stopped yet.");
      }
    }

    if (key === "\u0003" || key === "q" || key === "kill") {
      console.log("🔴 Killing server...");
      process.exit(0);
    }
  });
} else {
  console.log("⚠️ Not running in TTY - keyboard input disabled");
  console.log("💡 To resume a stopped process, restart the server or use: kill -CONT <PID>");
}


fs.watch(completedFile, (eventType) => {
  if (eventType === "change") {
    try {
      const data = JSON.parse(fs.readFileSync(completedFile, "utf8"));

      if (data.rule && data.rule.completed === true) {
        console.log("🚨 Rule marked completed! Stopping cursor process...");
        stopLatestCursor();
      } else {
        console.log("ℹ️ completed.json changed but rule not completed.");
      }
    } catch (err) {
      console.error("❌ Failed to parse completed.json:", err.message);
    }
  }
});
