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


app.get("/stop-cursor", (req, res) => {
  res.send("🛑 Attempting to stop Cursor...");
  stopLatestCursor();
});

app.get("/mark-completed", (req, res) => {
  let data = JSON.parse(fs.readFileSync(completedFile, "utf8"));
  data.rule.completed = true;
  data.status = "completed";
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(completedFile, JSON.stringify(data, null, 2), "utf8");
  res.send("✅ Marked as completed! Cursor will be stopped shortly...");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Completed file path: ${completedFile}`);
});

let lastStoppedPid = null;
const isWindows = process.platform === 'win32';

function stopLatestCursor() {
  // Cross-platform process finding
  const cmd = isWindows 
    ? `tasklist /fi "imagename eq Cursor.exe" /fo csv | findstr /i "cursor"`
    : `ps -eo pid,ppid,comm,lstart,etime | grep -i "cursor" | grep -v grep | sort -k6,7 | tail -n 1`;
  
  exec(cmd, (err, stdout) => {
    if (err) {
      console.error("❌ Error finding cursor process:", err.message);
      return;
    }
    
    const processInfo = stdout.trim();
    if (processInfo) {
      let pid;
      
      if (isWindows) {
        // Windows: Parse CSV output from tasklist
        const lines = processInfo.split('\n');
        if (lines.length > 0) {
          const csvLine = lines[0].replace(/"/g, '').split(',');
          pid = csvLine[1]; // PID is second column in CSV
        }
      } else {
        // Unix/Mac: First column is PID
        pid = processInfo.split(/\s+/)[0];
      }
      
      if (pid) {
        lastStoppedPid = pid;
        console.log("🔎 Latest cursor process details:");
        console.log(processInfo);

        console.log(`\n⏸️ Stopping cursor process with PID: ${pid}`);
        
        // Cross-platform kill command
        const killCmd = isWindows 
          ? `taskkill /PID ${pid} /F`
          : `kill -STOP ${pid}`; // Use STOP instead of -9 for suspend
        
        exec(killCmd, (stopErr) => {
          if (stopErr) {
            console.error("❌ Failed to stop cursor process:", stopErr.message);
          } else {
            console.log(`✅ Cursor process ${pid} ${isWindows ? 'terminated' : 'suspended'}.`);
            if (!isWindows) {
              console.log(`👉 Press 'c' in this terminal to resume it.`);
            }

            let data = JSON.parse(fs.readFileSync(completedFile, "utf8"));
            data.status = "stopped";
            data.rule.completed = false; 
            data.lastStoppedProcess = {
              pid,
              details: processInfo,
              stoppedAt: new Date().toISOString(),
              platform: process.platform,
              canResume: !isWindows
            };
            data.lastUpdated = new Date().toISOString();

            fs.writeFileSync(completedFile, JSON.stringify(data, null, 2), "utf8");
          }
        });
      }
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
      if (lastStoppedPid && !isWindows) {
        console.log(`▶️ Resuming cursor process with PID: ${lastStoppedPid}`);
        exec(`kill -CONT ${lastStoppedPid}`, (err) => {
          if (err) {
            console.error("❌ Failed to resume cursor process:", err.message);
          } else {
            console.log(`✅ Cursor process ${lastStoppedPid} resumed successfully.`);
          }
        });
      } else if (isWindows) {
        console.log("⚠️ Windows: Cannot resume terminated process. Please restart Cursor manually.");
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
