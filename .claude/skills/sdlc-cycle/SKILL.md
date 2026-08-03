---
name: sdlc-cycle
description: "Run the full agentic SDLC cycle (dev -> qa -> pr-creator) on a Jira ticket or requirement, end to end, via the orchestrator agent. Use for 'implement and ship <ticket>' style requests instead of manually invoking dev, qa, or pr-creator one at a time."
user-invocable: true
argument-hint: "A Jira ticket key/URL (e.g. KAN-11) or a plain-text requirement to implement, verify, and ship"
---
# SDLC Cycle Skill

## Procedure

1. Take the ticket key/URL or requirement passed as an argument. If none was given, ask the user for one before proceeding.
2. Invoke the `orchestrator` agent (via the Agent tool, `subagent_type: "orchestrator"`) with that ticket/requirement as the task.
3. Do not invoke `dev`, `qa`, or `pr-creator` directly yourself — the orchestrator owns sequencing, the dev/qa rejection loop (capped at 2 rounds), and the QA-gated handoff to `pr-creator`.
4. When the orchestrator completes, relay its final report to the user as-is: cycle summary (ticket, dev rounds, QA verdict), the PR it produced (or the escalation reason if QA never approved), and the artifact pointers (`claude-test-artifacts/`, `claude-docs/review-findings.md`).
5. If the orchestrator escalates instead of completing, surface the escalation reason clearly and ask the user how to proceed — do not silently retry or invoke pr-creator yourself to "finish" it.
