# Linear-Codex CLI

A command-line interface that fetches issues from [Linear](https://linear.app/) and opens them in **ChatGPT Codex** to instantly generate code solutions or implementation guidance.

---

## ✨ Features

• **Fetch by key or ID** – Retrieve any Linear issue using the familiar `ABC-123` identifier or the raw UUID.

• **Smart context builder** – Optionally include sub-issues and specify the relevant project folder when working in a monorepo.

• **Browser automation** – Launches (or re-uses) a Chrome session with remote debugging, opens the ChatGPT Codex page, pastes the compiled prompt, and triggers the **Code** action.

• **Stealth browsing** – Uses `puppeteer-extra` with stealth & anonymise-UA plugins to reduce detection surface.

---

## 🚀 Quick start

```bash
# 1. Clone the repo
$ git clone https://github.com/<your-org>/linear-codex-cli.git
$ cd linear-codex-cli

# 2. Install dependencies
$ npm install

# 3. Make the command globally available (optional)
$ npm link   # or: npm install ‑g .
```

Set your Linear API token (create one in **Settings → API**):

```bash
export LINEAR_API_KEY="lin_api_…"
```

Now run the CLI:

```bash
# Fetch issue ABC-123 and open it in ChatGPT Codex
$ linear-codex code ABC-123
```

During execution you will be prompted to

1. Include or skip any sub-issues.
2. Indicate whether the repository is a monorepo and, if so, which project to focus on.
3. Confirm the final prompt before it is sent to Codex.

The tool will attempt to connect to an existing Chrome instance at `http://localhost:9222`. If none is found it launches a new one with a persistent profile in `/tmp/chrome-remote-profile`.

> **Heads-up:** The default Chrome path in `index.js` is hard-coded for macOS (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Update this value if you use Linux or Windows.

---

## 🖥  Requirements

• **Node.js** v18 or later (for built-in `fetch`)

• **Google Chrome** installed locally and accessible via the path above

• A valid **Linear API Key** stored in the environment variable `LINEAR_API_KEY`

• A ChatGPT account with access to the Codex tab (currently in beta / Labs)

---

## 📄 API & commands

```text
linear-codex <command> [options]

Commands:
  code <ticketId>   Fetch a Linear ticket and open it in ChatGPT Codex
  help [command]    Show CLI help

Global options:
  -V, --version     Show version
  -h, --help        Show help
```

### Examples

```bash
# Basic usage – by readable key
linear-codex code ENG-42

# By raw issue UUID
linear-codex code 4d14f0c4-9c5a-4b2f-90a3-…

# Inside a monorepo (prompted interactively)
linear-codex code APP-777
```

---

## ⚙️  Configuration

All configuration happens at runtime via interactive prompts or the following environment variable:

| Variable          | Description                       |
| ----------------- | --------------------------------- |
| `LINEAR_API_KEY`  | Personal API token from Linear    |

Tip: put this in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.).

---

## 🛠  Development

```bash
# Run the CLI locally without linking
node index.js code TEST-1

# Run tests (coming soon)
npm test
```

Formatting is handled by **Prettier** and linting by **ESLint** (configs TBD).

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/something`)
3. Commit your changes (`git commit -m "feat: add something"`)
4. Push to the branch (`git push origin feat/something`)
5. Open a pull request

Please make sure your code follows the project conventions and passes linting.

---

## 🪪 License

MIT © 2025 Devion Villegas

---

## 🙏 Acknowledgements

• [Linear](https://linear.app/) for their excellent GraphQL API

• [ChatGPT](https://chat.openai.com/) for Codex

• [puppeteer-extra](https://github.com/berstend/puppeteer-extra) and its plugin ecosystem

• [Commander.js](https://github.com/tj/commander.js/) and [Inquirer](https://github.com/SBoudrias/Inquirer.js/) 