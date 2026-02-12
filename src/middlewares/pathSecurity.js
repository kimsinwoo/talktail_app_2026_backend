/**
 * Secure path resolution for file operations (CSV download/delete).
 * Prevents path traversal by enforcing that resolved path is strictly
 * inside a base directory. Use path.resolve for canonical paths.
 */

const path = require('path');
const fs = require('fs');
const { AppError } = require('./errorHandler');

/**
 * Resolve a user-supplied path against a base directory.
 * Only allows paths inside baseDir. Rejects '..', absolute paths, and empty.
 *
 * @param {string} baseDir - Absolute path to the allowed root (e.g. user CSV dir)
 * @param {string} requestedPath - Relative path from query/params (must not contain ..)
 * @returns {string} Absolute path inside baseDir
 * @throws {AppError} 400 for invalid path, 403 if path escapes base
 */
function resolvePathWithinBase(baseDir, requestedPath) {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new AppError('파일 경로가 필요합니다.', 400);
  }

  const trimmed = requestedPath.trim();
  if (trimmed === '' || trimmed.includes('\0')) {
    throw new AppError('잘못된 파일 경로입니다.', 400);
  }

  const normalized = path.normalize(trimmed).replace(/^(\.\.(\/|\\|$))+/, '');
  if (normalized.startsWith('..') || path.isAbsolute(trimmed)) {
    throw new AppError('잘못된 파일 경로입니다.', 400);
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, normalized);

  if (!resolvedPath.startsWith(resolvedBase) || resolvedPath === resolvedBase) {
    throw new AppError('접근 권한이 없습니다.', 403);
  }

  return resolvedPath;
}

/**
 * Ensure path points to an existing file (not directory).
 *
 * @param {string} filePath - Absolute path
 * @throws {AppError} 404 if not exists or not a file
 */
function assertFileExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new AppError('파일을 찾을 수 없습니다.', 404);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('파일을 찾을 수 없습니다.', 404);
  }
}

module.exports = {
  resolvePathWithinBase,
  assertFileExists,
};
