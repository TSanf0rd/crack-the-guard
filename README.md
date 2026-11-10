# Crack the Guard
 
A browser game where you try to trick six AI systems into giving up a secret. Each target has stronger defenses than the last, starting with a chatbot that has no rules and ending with an AI agent behind layered filters.
 
**Play it:** https://tsanf0rd.github.io/crack-the-guard/
 
I built this for a Missouri S&T Miner Champions visit to introduce high school students to computer science and AI security. It works on phones, laptops, and Chromebooks with nothing to install.
 
## How to play
 
1. Read the target's description and look at its defense diagram. Solid boxes are defenses it has. Dashed boxes are turned off.
2. Chat with the target and try to get it to reveal its secret.
3. Type the secret into the box below the chat and submit it to unlock the next target.
4. Stuck? Press **Get a hint**. Each press gives a more specific hint.
After each crack, you'll see the technique you used, a real incident where it worked, and how defenders stop it.
 
## The targets
 
| # | Target | Similar to in the real world |
|---|--------|------------------------------|
| 1 | Bare chatbot | Company bots and custom GPTs handed private data with no rules about sharing it |
| 2 | Customer support bot | Support chatbots on airline, retail, and car dealership websites |
| 3 | Homework helper | AI tutors hardened against common attacks |
| 4 | Workplace copilot | Office AI assistants that scan replies for private data |
| 5 | Guardrailed model | Guardrail and moderation layers placed in front of chatbots |
| 6 | AI agent | Agents that read email and files and take actions for people |
 
The techniques covered are direct requests, instruction override (prompt injection), roleplay and fiction, encoding to get past output filters, blocklist evasion, and hiding data in the structure of a reply.
 
## How it works
 
The targets are simulated. There's no real language model, API key, or server behind them. Each target is a set of rules written in JavaScript that checks your message for the kinds of tricks attackers use against real chatbots, then replies the way a vulnerable system would.
 
I built it this way so it's free for every player, works offline, behaves the same for everyone in a classroom, and can't say anything unexpected. The tradeoff is that a target can't respond to a creative trick that isn't covered by its rules.
 
The whole game is one file, `index.html`, with no build step or dependencies.
 
## A note on the source code
 
The secrets are in the source code, since the game runs entirely in your browser. You can find them by viewing the page source, but that skips the point. It's also the lesson from Target 1: anything you send to someone's browser, or put in a model's instructions, should be treated as public.
 
## Run it locally
 
Download `index.html` and open it in any modern browser. Progress saves in your browser, and **Start over** resets it.
 
## Responsible use
 
The tricks in this game work on real AI systems. Only test systems you own or have written permission to test. Companies run bug bounty programs for exactly this kind of research.
 
## Author
 
Tyler, computer science student at Missouri University of Science and Technology.
