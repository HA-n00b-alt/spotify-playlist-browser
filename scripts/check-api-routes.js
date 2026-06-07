#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./lib/env')

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      files.push(fullPath)
    }
  }
  return files
}

function main() {
  const apiRoot = path.join(ROOT, 'app', 'api')
  if (!fs.existsSync(apiRoot)) {
    console.error('check:api-routes failed: app/api not found')
    process.exit(1)
  }

  const routes = walk(apiRoot)
  const errors = []

  for (const file of routes) {
    const content = fs.readFileSync(file, 'utf8')
    const hasHandler = HTTP_METHODS.some((method) => {
      if (new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(content)) return true
      if (new RegExp(`export\\s+const\\s+${method}\\b`).test(content)) return true
      if (new RegExp(`export\\s*\\{[^}]*\\b${method}\\b`).test(content)) return true
      return false
    })

    if (!hasHandler) {
      errors.push(`${path.relative(ROOT, file)} exports no HTTP handler`)
    }
  }

  if (routes.length === 0) {
    errors.push('No API route handlers found under app/api')
  }

  if (errors.length > 0) {
    console.error('check:api-routes failed:')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    process.exit(1)
  }

  console.log(`check:api-routes passed (${routes.length} routes)`)
}

main()
