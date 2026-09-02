# json-analyzer

CLI tool to query JSON files with JSONPath and compare records within a single file.

## Prerequisites

- Node.js 18+

## Install

```bash
npm install
npm link
```

You can also run commands directly:

```bash
node bin/json-analyze.js <command>
```

## Commands

### Query

Run a JSONPath expression against a file:

```bash
json-analyze query samples/users.json "$.users[*].email"
json-analyze query samples/users.json "$.users[0]" --pretty
```

### Compare

Compare records at an array path:

```bash
# Field coverage summary
json-analyze compare samples/users.json "$.users"

# Diff two records by index
json-analyze compare samples/users.json "$.users" --pair 0,2

# Find duplicate records
json-analyze compare samples/users.json "$.users" --duplicates
json-analyze compare samples/users.json "$.users" --duplicates --keys id,email
```



## JSONPath cheat sheet

- `$.users` — root `users` array
- `$.users[*].email` — all user emails
- `$.users[0]` — first user object



## Project layout

- `bin/json-analyze.js` — CLI entry point
- `src/load.js` — file loading and JSON parsing
- `src/query.js` — JSONPath queries
- `src/compare.js` — record summary, pair diff, duplicate detection
- `samples/users.json` — sample data for demos

to run:
node scripts/compare-raw-data.js rawData.json comparison-results.csv  
node scripts/count-coverage-grids.js rawData.json coverage-grid-counts.csv