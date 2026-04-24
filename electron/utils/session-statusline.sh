#!/bin/bash
# Session-specific status line for Starklab AgentHub
# Reads Claude Code status JSON from stdin, extracts cost/token data,
# writes to a shared file for the main process to read.
#
# Usage: Set as --status-line in Claude Code CLI args.
# The AGENTHUB_USAGE_FILE env var must be set to the output file path.

input=$(cat)

# Write raw usage JSON to file for AgentHub to read
if [ -n "$AGENTHUB_USAGE_FILE" ]; then
  cost_usd=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')
  total_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
  total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
  used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // 0')

  jq -n \
    --argjson costUsd "$cost_usd" \
    --argjson inputTokens "$total_in" \
    --argjson outputTokens "$total_out" \
    --argjson usedPct "$used_pct" \
    '{costUsd: $costUsd, inputTokens: $inputTokens, outputTokens: $outputTokens, usedPct: $usedPct}' \
    > "$AGENTHUB_USAGE_FILE" 2>/dev/null
fi

# Still output normal status (pass through to user's default statusline if configured)
model=$(echo "$input" | jq -r '.model.display_name // "unknown"')
ctx_used=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
total_in=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
cost_usd=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')

# Format tokens
fmt_tok() {
  local n=$1
  if [ "$n" -ge 1000000 ]; then printf "%.1fM" "$(echo "scale=1;$n/1000000"|bc)";
  elif [ "$n" -ge 1000 ]; then printf "%.1fk" "$(echo "scale=1;$n/1000"|bc)";
  else echo "$n"; fi
}

tok=$(fmt_tok $(( total_in + total_out )))
printf "\e[38;2;0;119;194m\e[1m%s\e[0m  ctx: %s%%  tok: %s  \$%s\n" "$model" "$ctx_used" "$tok" "$cost_usd"
