const fs = require('fs');
const path = require('path');

// File extensions we know how to extract content from
const SCANNABLE_EXTS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx', '.md', '.json', '.txt']);

// Directories to skip
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', '.vercel', 'public']);

function scanDirectory(dirPath, maxDepth = 4) {
  const results = [];

  function walk(currentPath, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCANNABLE_EXTS.has(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const text = extractText(content, ext);
            if (text.length > 50) {
              results.push({
                path: fullPath,
                relativePath: path.relative(dirPath, fullPath),
                text,
              });
            }
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  walk(dirPath, 0);
  return results;
}

function extractText(content, ext) {
  if (ext === '.md' || ext === '.mdx' || ext === '.txt') {
    // Strip frontmatter
    return content.replace(/^---[\s\S]*?---\n?/, '').trim();
  }

  if (ext === '.json') {
    // Extract string values from JSON
    try {
      const obj = JSON.parse(content);
      return extractJsonStrings(obj).join(' ');
    } catch {
      return '';
    }
  }

  // For TSX/JSX/TS/JS — extract string literals and JSX text content
  return extractFromCode(content);
}

function extractJsonStrings(obj, depth = 0) {
  if (depth > 5) return [];
  const strings = [];

  if (typeof obj === 'string' && obj.length > 10) {
    strings.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      strings.push(...extractJsonStrings(item, depth + 1));
    }
  } else if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      strings.push(...extractJsonStrings(val, depth + 1));
    }
  }

  return strings;
}

function extractFromCode(content) {
  const parts = [];

  // Extract JSX text content (between > and <)
  const jsxText = content.match(/>([^<>{]+)</g);
  if (jsxText) {
    for (const match of jsxText) {
      const text = match.slice(1).trim();
      if (text.length > 5 && !/^[{}\s()]+$/.test(text)) {
        parts.push(text);
      }
    }
  }

  // Extract string literals (single and double quoted, longer ones)
  const strings = content.match(/['"`]([^'"`\n]{15,}?)['"`]/g);
  if (strings) {
    for (const match of strings) {
      const text = match.slice(1, -1).trim();
      if (text.length > 15 && !text.includes('className') && !text.includes('import')) {
        parts.push(text);
      }
    }
  }

  return parts.join(' ');
}

// Scan a source and return searchable text chunks
function scanSource(source) {
  if (source.type === 'folder') {
    if (!fs.existsSync(source.path)) {
      return { error: `Folder not found: ${source.path}`, chunks: [] };
    }
    const files = scanDirectory(source.path);
    return {
      error: null,
      fileCount: files.length,
      chunks: files.map(f => ({
        source: source.name,
        file: f.relativePath,
        text: f.text,
      })),
    };
  }

  return { error: 'Unsupported source type', chunks: [] };
}

module.exports = { scanSource, scanDirectory, extractText };
