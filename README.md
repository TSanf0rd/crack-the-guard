# Crack the Guard

A capture-the-flag game for high school students, built for Missouri S&T Miner Champions visits. Players break simulated AI chatbots, fix a Cisco router, read packet captures, write firewall rules, and investigate logs. Every flag looks like `flag{...}`.

Everything runs in the browser. There is no server, no account, and no real AI model behind the targets: each chatbot is a rule-based simulation, so it works offline and behaves the same for every student.

## What's on the board

| Category | Challenges |
| --- | --- |
| AI Warm-up | 6 chatbot targets, 100 pts each (prompt injection, refusal bypass, filter evasion, social engineering) |
| AI Advanced | 7 targets, 300 pts each (encoding evasion, multi-turn attacks, exfiltration, a leaked API key, a rogue attack agent) |
| Cisco | Router rescue, Lock it down |
| Network | Nmap scan, Packet sniffer, Firewall rules |
| IT Essentials | Phishing headers, Terminal hunt, Log detective |
| Quick fire | Subnetting speed round |

Each AI target has a **Vulnerable / Fixed** toggle so students can retry the same attack against a hardened version and see the defense.

## Repo layout

| Path | What it is |
| --- | --- |
| `index.html` | The live site. A single self-contained file built from `app/`. |
| `app/` | React + TypeScript source. |
| `classic/` | The original plain-HTML version, kept as a backup (`/classic/`). `boss.html` is the optional Ollama final boss. |

## Edit and redeploy

```bash
cd app
npm install
npm run dev        # local preview with hot reload
npm run publish    # builds one file and copies it to ../index.html
```

Commit and push. GitHub Pages serves `index.html` from the `main` branch root, so the site updates a minute or two later.

The same `index.html` also works opened straight from a USB stick, no server needed.

## Stack

React 19, TypeScript, Vite. No UI library. Fonts: Barlow Condensed, IBM Plex Sans, JetBrains Mono.

## Credits

- Built by Tyler Sanford, Missouri S&T ACM Security.
- Some AI attack scenarios were adapted from the DEF CON workshop "From Prompt to PWN" by Abhinav Verma and Mukesh Aggarwal.
- The leaked-key and attack-agent targets draw on Google Threat Intelligence Group's November 2026 report on AI-enabled attacks.
- Only test systems you have permission to test.
