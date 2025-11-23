# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-20

### Added
- Initial release of Temporal Workflow Engine
- YAML-based workflow definition DSL
- DAG-based workflow execution with automatic dependency resolution
- Mustache templating for dynamic input resolution
- Conditional step execution with `when` clauses
- Signal-based steps for external events and approvals
- Per-step timeout configuration
- Configurable retry policies with exponential backoff
- Built-in activities: validateInput, createUser, sendEmail, processPayment, logMessage, fetchData, wait
- Docker Compose setup for Temporal server and UI
- Comprehensive test suite with Vitest
- TypeScript implementation with full type safety
- Example workflows and client code
- Documentation and README

### Features
- **Declarative Workflows**: Define complex workflows in YAML without writing code
- **Parallel Execution**: Automatic parallel execution of independent steps
- **Error Handling**: Smart retry logic and dependency propagation
- **Observability**: Integration with Temporal UI for monitoring and debugging
- **Extensibility**: Easy to add custom activities

### Technical Details
- Built with Temporal Node SDK v1.12.3
- TypeScript 5.9+
- Node.js 18+ required
- Uses dependency-graph for DAG validation
- Mustache.js for templating

## [Unreleased]

### Planned
- Workflow versioning and migration support
- Parallel execution groups
- Dynamic workflow generation
- Workflow composition (sub-workflows)
- Enhanced monitoring and metrics
- GraphQL/REST API for workflow management
- Visual workflow editor

---

[1.0.0]: https://github.com/yourusername/temporal-workflow-engine/releases/tag/v1.0.0
