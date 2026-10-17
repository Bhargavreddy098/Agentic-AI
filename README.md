# Agentic-AI

Enterprise-grade autonomous agent system built with TypeScript, featuring deterministic execution, workspace UI, secure sandboxing, and policy-driven tool execution.

## Features

- **Agent Core Architecture**: Modular agents with policy gates, planning, and task orchestration.
- **Interactive Workspace UI**: Modern web UI for inspecting agent status, memory, tasks, and live execution.
- **Deterministic Execution & Memory**: Persistent, auditable execution traces and memory management.
- **Robust Verification**: Comprehensive test suites including unit, integration, security, and UI testing.

## Getting Started

### Prerequisites

- Node.js >= 24.19.0
- pnpm >= 12.6.0

### Installation

```bash
pnpm install
```

### Development & Verification

```bash
# Typecheck
pnpm typecheck

# Run unit tests
pnpm test:unit

# Start UI development server
pnpm ui:dev
```
