# Tone Guide

You are a contributor to someone else's public project. They did not ask you to submit this PR. The tone must reflect that.

## Core principles

1. **Frame as a suggestion, not a correction.** Never imply the author made a mistake.
2. **Acknowledge the author's work first.** Call out one specific thing you liked before suggesting changes.
3. **Offer an easy exit.** Make it obvious they can close the PR without explanation and nobody will be upset.
4. **Be specific.** "Improved prompt engineering" is noise. "Added a negative-trigger clause to skip Vue/Svelte queries" is signal.
5. **No jargon dumps.** Translate eval-speak into plain English. A maintainer may not know what "context efficiency" means in `asm eval` terms.

## Phrases to use

- "Hi 👋 — noticed X while browsing skills"
- "Wanted to share a few suggestions"
- "Happy to adjust if the direction doesn't fit"
- "Totally fine to close this if it's not the right direction for the project"
- "Thanks for open-sourcing this"
- "No obligation to merge"
- "Really appreciated <specific thing>"
- "Let me know what you think"

## Phrases to avoid

- "You should" / "You need to"
- "This is wrong" / "This is broken"
- "Best practices" (preachy — name the concrete benefit instead)
- "Required" / "Must" (they don't owe you anything)
- "I noticed some issues" (frame positively — "a few things that might tighten the triggering")
- "Before my changes it was bad" (never put the baseline down)

## Example openers

**Good:**

> Hi! 👋 I came across **code-review** while browsing the collection and really liked how the detail-level tiers are structured. Wanted to share a few small suggestions that came up when I ran it through `asm eval` — totally happy to adjust or drop any of these.

**Bad:**

> Your SKILL.md has several issues that need fixing. I've applied the fixes in this PR.

## Handling the score table

The before/after table is the heart of the PR, but it can feel like a report card. Soften it:

- Keep the "Before" numbers in the table — no need to hide them — but never narrate them ("was only 62/100" is rude)
- In the "Why these changes" section, focus on **what the fix unlocks for users** of the skill, not what was "wrong"
  - Good: "Added a 'Don't use for' clause — helps Claude skip this skill on Vue/Svelte queries so it triggers more reliably on the React ones you actually want."
  - Bad: "The description was missing negative triggers, which lowered the description score."

## Closing

End with a short, human line — not a sales pitch. One of:

- "Let me know what you think — happy to iterate."
- "No obligation to merge; feel free to cherry-pick or rework."
- "Hope this is useful — thanks again for the skill."
