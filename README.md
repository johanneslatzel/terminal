# Terminal

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![NPM](https://nodei.co/npm/@johannes.latzel/terminal.svg?style=shields&data=n,v,u,d,s)](https://www.npmjs.com/package/@johannes.latzel/terminal)
[![version](https://img.shields.io/github/package-json/v/johanneslatzel/terminal)](https://github.com/johanneslatzel/terminal/releases)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/johanneslatzel/terminal/pulls)
[![Feedback Welcome](https://img.shields.io/badge/feedback-welcome-brightgreen)](https://github.com/johanneslatzel/terminal/discussions)
[![codecov](https://codecov.io/gh/johanneslatzel/terminal/graph/badge.svg)](https://codecov.io/gh/johanneslatzel/terminal)
[![CI](https://github.com/johanneslatzel/terminal/actions/workflows/ci.yml/badge.svg)](https://github.com/johanneslatzel/terminal/actions/workflows/ci.yml)
[![Socket Badge](https://badge.socket.dev/npm/package/@johannes.latzel/terminal/latest)](https://badge.socket.dev/npm/package/@johannes.latzel/terminal/latest)

Tree-structured TypeScript terminal/shell engine with automatic help, tab completion, `--flag` argument parsing, interactive prompting for missing required arguments, `|` pipelines, builtin commands, and a lifecycle hook system.

## Features

- hierarchical namespaces with dot-separated paths
- command hints and tab completion of command names, `--flag`s, and enum values
- typed arguments using zod schemas with interactive prompting for missing values
- pipelines
- builtin commands: help, exit, clear, select, json, table, sort, clip, filter, aggregate
- lifecycle hooks
- optional JSON history persistence across sessions

## Prerequisites

- Node.js >= 18

## Installation

```bash
npm install @johannes.latzel/terminal
```

## Documentation

Full documentation at **[johanneslatzel.github.io/terminal/](https://johanneslatzel.github.io/terminal/)**

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

Issues and PRs welcome at [github.com/johanneslatzel/terminal](https://github.com/johanneslatzel/terminal).