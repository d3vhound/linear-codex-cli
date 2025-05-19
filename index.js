#!/usr/bin/env node

const os = require("os");
const path = require("path");
const { Command } = require("commander");
const { spawn } = require("child_process");

// Handle both CommonJS and ESM distributions of inquirer (v8 vs v9+)
let inquirer = require("inquirer");
if (inquirer.default) {
  // Inquirer v9 (ESM-only) returns the module under the `default` key when required
  inquirer = inquirer.default;
}
// Use the built-in global fetch in newer Node versions (>=18). For older versions, fallback to dynamically importing node-fetch (v3, ESM-only).
let fetch = global.fetch;
if (!fetch) {
  fetch = (...args) =>
    import("node-fetch").then(({ default: fn }) => fn(...args));
}
// Use puppeteer-extra with the stealth plugin to reduce detection surface
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const AnonymizeUA = require("puppeteer-extra-plugin-anonymize-ua");
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUA({ stripHeadless: true, makeWindows: false }));

// Expect Linear API key from env variable
const linearToken = process.env.LINEAR_API_KEY;
if (!linearToken) {
  console.error(
    "Error: Please set the LINEAR_API_KEY environment variable to your Linear API token.",
  );
  process.exit(1);
}

const program = new Command();
program
  .name("linear-codex")
  .description("CLI to fetch Linear tickets and send to ChatGPT Codex")
  .version("1.0.0");

program
  .command("code <ticketId>")
  .description("Fetch a Linear ticket by ID and send it to ChatGPT Codex")
  .action(async (ticketId) => {
    try {
      // const user = await getCurrentUser()
      // console.log({ user });

      // 1. Fetch the Linear ticket (name and description) via GraphQL API
      // Determine if ticketId is in format TEAM-123 or a raw ID
      let issueData;
      if (ticketId.includes("-")) {
        // Use the official "issue(identifier)" query which accepts the human-readable key (e.g. "ABC-123").
        const query = `
                        query ($id: String!) {
                            issue(id: $id) {
                                id
                                title
                                description
                                comments(last: 50) {
                                    nodes {
                                        body
                                    }
                                }
                                children {
                                    nodes {
                                        title
                                        description
                                    }
                                }
                            }
                        }
                `;
        const variables = { id: ticketId };
        const resp = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${linearToken}`,
          },
          body: JSON.stringify({ query, variables }),
        });
        const result = await resp.json();
        if (result.errors || !result.data.issue) {
          throw new Error(
            `Linear issue ${ticketId} not found or access denied.`,
          );
        }
        issueData = result.data.issue;
      } else {
        // If a raw issue UUID is provided (not typical), use direct query by id
        const query = `
                        query ($id: String!) {
                            issue(id: $id) {
                            id
                            title
                            description
                            children {
                                nodes { title description }
                            }
                            }
                        }
                `;

        const variables = { id: ticketId };
        const resp = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${linearToken}`,
          },
          body: JSON.stringify({ query, variables }),
        });
        const result = await resp.json();
        if (result.errors || !result.data.issue) {
          throw new Error(
            `Linear issue ${ticketId} not found or access denied.`,
          );
        }
        issueData = result.data.issue;
      }

      // 2. Prompt to include sub-issues (child issues) if any exist
      let includeSubIssues = false;
      let subIssuesText = "";
      const children = issueData.children?.nodes || [];
      if (children.length > 0) {
        const { includeSubs } = await inquirer.prompt([
          {
            type: "confirm",
            name: "includeSubs",
            message: `Include ${children.length} sub-issue(s) in the context?`,
            default: false,
          },
        ]);
        includeSubIssues = includeSubs;
        if (includeSubIssues) {
          // Prepare sub-issues text (title and description for each sub-issue)
          subIssuesText = "Sub-issues:\n";
          for (const sub of children) {
            subIssuesText += `- ${sub.title}: ${sub.description}\n`;
          }
        }
      }

      // 3. Prompt for monorepo project context if applicable
      let projectContext = "";
      const { isMonorepo } = await inquirer.prompt([
        {
          type: "confirm",
          name: "isMonorepo",
          message: "Is this codebase a monorepo?",
          default: false,
        },
      ]);
      if (isMonorepo) {
        const { projectName } = await inquirer.prompt([
          {
            type: "input",
            name: "projectName",
            message:
              "Enter the specific project name or folder within the monorepo relevant to this issue:",
          },
        ]);
        if (projectName && projectName.trim() !== "") {
          projectContext = `Project context: (Monorepo) focus on the "${projectName.trim()}" project.\n`;
        }
      }

      // 4. Summarize/compile the content to send
      const issueTitle = issueData.title;
      const issueDescription = issueData.description || "";
      let combinedContent = `**Issue:** ${issueTitle}\n**Description:** ${issueDescription}\n`;
      if (includeSubIssues && subIssuesText) {
        combinedContent += subIssuesText;
      }
      if (projectContext) {
        combinedContent += projectContext;
      }

      // Display summary to user for confirmation
      console.log("\n=== Combined Content Preview ===");
      console.log(combinedContent);
      const { confirmSend } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmSend",
          message: "Proceed to open Codex with this content?",
          default: true,
        },
      ]);
      if (!confirmSend) {
        console.log("Aborted. The content was not sent to Codex.");
        process.exit(0);
      }

      // 5. Launch (or connect to) a Chrome instance running with remote debugging enabled.
      const remoteDebugPort = 9222;
      const remoteUserDataDir = "/tmp/chrome-remote-profile"; // persistent session directory
      const remoteEndpointURL = `http://localhost:${remoteDebugPort}`;

      async function tryConnect() {
        try {
          return await puppeteer.connect({
            browserURL: remoteEndpointURL,
            headless: true,
          });
        } catch (_) {
          return null;
        }
      }

      let browser = await tryConnect();
      if (!browser) {
        console.log(
          `No Chrome instance detected on ${remoteEndpointURL}. Launching a new one...`,
        );

        const chromePath =
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
        const chromeArgs = [
          `--remote-debugging-port=${remoteDebugPort}`,
          `--user-data-dir=${remoteUserDataDir}`,
        ];

        // Spawn Chrome detached so it continues running independently.
        const chromeProcess = spawn(chromePath, chromeArgs, {
          detached: true,
          stdio: "ignore",
        });
        chromeProcess.unref();

        // Poll until the debugging endpoint is ready (max ~10 seconds)
        const maxAttempts = 20;
        const delay = (ms) => new Promise((res) => setTimeout(res, ms));
        let attempt = 0;
        while (attempt < maxAttempts) {
          browser = await tryConnect();
          if (browser) break;
          await delay(500);
          attempt += 1;
        }

        if (!browser) {
          throw new Error(
            "Failed to start or connect to Chrome with remote debugging.",
          );
        }
      }
      const randomViewport = () => ({
        width: Math.floor(1280 + Math.random() * 400),
        height: Math.floor(720 + Math.random() * 360),
        deviceScaleFactor: 1,
      });
      const page = await browser.newPage();
      // Randomize viewport size to avoid fixed fingerprint
      await page.setViewport(randomViewport());
      // Attempt to emulate the system timezone for additional realism
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) {
          await page.emulateTimezone(tz);
        }
      } catch (_) {
        /* ignore if not supported */
      }
      console.log("Opening ChatGPT Codex page...");
      await page.goto("https://chatgpt.com/codex", {
        waitUntil: "networkidle2",
      });

      // If not logged in, the page may redirect to a login page.
      // (User should log in manually if needed, then re-run the command.)
      // Wait for the Codex input textbox to be present
      console.log(
        "Waiting for ChatGPT Codex editor to be fully loaded (please log in if prompted)...",
      );
      // Wait indefinitely until the Codex textarea becomes available so the user has time to authenticate.
      await page.waitForSelector("textarea", { timeout: 0 });

      // Populate the Codex input textbox with the combined content
      await page.focus("textarea");
      await page.keyboard.type(combinedContent, { delay: 0 });

      // Ask the user which action to trigger within Codex
      const { codexAction } = await inquirer.prompt([
        {
          type: "list",
          name: "codexAction",
          message: "Which Codex action should be triggered?",
          choices: [
            { name: "Code – have ChatGPT generate code", value: "code" },
            { name: "Ask – send as a normal question", value: "ask" },
            { name: "None – I will click manually", value: "none" },
          ],
          default: "code",
        },
      ]);

      if (codexAction !== "none") {
        // Click the chosen button (case-insensitive match on innerText)
        const buttons = await page.$$("button");
        for (const btn of buttons) {
          const label = await page.evaluate((el) => el.innerText || "", btn);
          if (label && label.trim().toLowerCase() === codexAction) {
            console.log(`Triggering Codex "${label.trim()}" action...`);
            await btn.click();
            break;
          }
        }
      }

      console.log("✅ Done! Check the browser for the Codex response.");
      // (Browser remains open for user to review the output)
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
