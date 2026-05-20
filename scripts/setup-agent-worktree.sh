#!/usr/bin/env bash
# scripts/setup-agent-worktree.sh <agent-name>
# Creates a permanent git worktree for a parallel AI agent session.

set -euo pipefail

AGENT_NAME=$1
WORKTREE_PATH="../peptides-$AGENT_NAME"

if [ -z "$AGENT_NAME" ]; then
  echo "Usage: $0 <agent-name>"
  exit 1
fi

if [ -d "$WORKTREE_PATH" ]; then
  echo "Error: Worktree directory $WORKTREE_PATH already exists."
  exit 1
fi

echo "Creating worktree for agent: $AGENT_NAME at $WORKTREE_PATH"

# Create the worktree on a new branch named after the agent
git worktree add -b "agent/$AGENT_NAME" "$WORKTREE_PATH" main

# Initialize the environment in the new worktree
pushd "$WORKTREE_PATH" > /dev/null
cp .env.example .env
pnpm install
popd > /dev/null

echo "Success! Agent worktree ready."
echo "To start the session: cd $WORKTREE_PATH && claude"
