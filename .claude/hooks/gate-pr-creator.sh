#!/bin/bash
# PreToolUse backstop for the Agent tool: blocks invoking the pr-creator
# subagent unless claude-docs/review-findings.md's most recent dated
# section has an APPROVED verdict. The orchestrator agent already gates
# this in its instructions; this hook enforces it even if some other
# agent tries to invoke pr-creator directly, skipping the orchestrator.

set -euo pipefail

input="$(cat)"

subagent_type="$(printf '%s' "$input" | jq -r '.tool_input.subagent_type // empty')"

if [ "$subagent_type" != "pr-creator" ]; then
  exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
findings_file="$repo_root/claude-docs/review-findings.md"

deny() {
  reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ ! -s "$findings_file" ]; then
  deny "claude-docs/review-findings.md is missing or empty — pr-creator can only run after qa records an APPROVED verdict there."
fi

# Most recent "Overall Verdict" bold line (qa appends new dated sections at the end).
verdict_line="$(grep -A2 '^## Overall Verdict$' "$findings_file" | grep '^\*\*' | tail -1 || true)"

if [ -z "$verdict_line" ]; then
  deny "No 'Overall Verdict' entry found in claude-docs/review-findings.md — qa must record a verdict before pr-creator can run."
fi

if printf '%s' "$verdict_line" | grep -q "REJECTED"; then
  deny "Most recent QA verdict is REJECTED ($verdict_line) — send the implementation back to dev, don't invoke pr-creator."
fi

if ! printf '%s' "$verdict_line" | grep -q "APPROVED"; then
  deny "Most recent QA verdict does not contain an APPROVED keyword ($verdict_line) — pr-creator requires explicit QA approval."
fi

exit 0
