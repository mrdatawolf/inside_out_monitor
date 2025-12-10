import https from 'https';
import http from 'http';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import tls from 'tls';

/**
 * Web and File Monitoring Library
 *
 * Provides functions to monitor:
 * - Web endpoints (HTTP/HTTPS availability, response time, status codes)
 * - Files (existence, size, modification time, creation time, hash)
 * - Folders (file count, total size)
 * - SSL certificates (validation, expiration)
 */

/**
 * Check web endpoint availability
 * @param {Object} target - Target configuration
 * @param {string} target.url - URL to check
 * @param {number} [target.timeout=5000] - Request timeout in ms
 * @param {number} [target.expectedStatus=200] - Expected status code
 * @param {boolean} [target.ignoreSsl=true] - Ignore SSL certificate errors
 * @returns {Promise<Object>} Result with status, response_time_ms, status_code
 */
export async function checkWebEndpoint(target) {
  const startTime = Date.now();
  const timeout = target.timeout || 5000;
  const ignoreSsl = target.ignoreSsl !== undefined ? target.ignoreSsl : true;

  try {
    const urlObj = new URL(target.url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      method: 'GET',
      timeout: timeout,
      // Don't follow redirects
      maxRedirects: 0,
    };

    // Ignore SSL errors if configured
    if (isHttps && ignoreSsl) {
      options.rejectUnauthorized = false;
    }

    return new Promise((resolve) => {
      const req = httpModule.get(target.url, options, (res) => {
        const responseTime = Date.now() - startTime;

        // Consume response data to free up memory
        res.on('data', () => {});
        res.on('end', () => {
          const expectedStatus = target.expectedStatus || 200;
          const status = res.statusCode === expectedStatus ? 'online' : 'warning';

          resolve({
            type: 'web',
            url: target.url,
            name: target.name || target.url,
            status: status,
            response_time_ms: responseTime,
            status_code: res.statusCode,
            error: null
          });
        });
      });

      req.on('error', (err) => {
        const responseTime = Date.now() - startTime;
        resolve({
          type: 'web',
          url: target.url,
          name: target.name || target.url,
          status: 'offline',
          response_time_ms: responseTime,
          status_code: null,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const responseTime = Date.now() - startTime;
        resolve({
          type: 'web',
          url: target.url,
          name: target.name || target.url,
          status: 'offline',
          response_time_ms: responseTime,
          status_code: null,
          error: 'Request timeout'
        });
      });
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    return {
      type: 'web',
      url: target.url,
      name: target.name || target.url,
      status: 'offline',
      response_time_ms: responseTime,
      status_code: null,
      error: err.message
    };
  }
}

/**
 * Check SSL certificate validity and expiration
 * @param {Object} target - Target configuration
 * @param {string} target.url - HTTPS URL to check
 * @param {number} [target.timeout=5000] - Connection timeout in ms
 * @returns {Promise<Object>} Result with certificate info
 */
export async function checkSslCertificate(target) {
  try {
    const urlObj = new URL(target.url);

    if (urlObj.protocol !== 'https:') {
      return {
        type: 'ssl',
        url: target.url,
        name: target.name || target.url,
        status: 'n/a',
        valid: null,
        expires: null,
        days_until_expiry: null,
        error: 'Not an HTTPS URL'
      };
    }

    const timeout = target.timeout || 5000;
    const hostname = urlObj.hostname;
    const port = urlObj.port || 443;

    return new Promise((resolve) => {
      const socket = tls.connect({
        host: hostname,
        port: port,
        servername: hostname,
        rejectUnauthorized: false, // We want to check even invalid certs
        timeout: timeout
      }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_from) {
          resolve({
            type: 'ssl',
            url: target.url,
            name: target.name || target.url,
            status: 'error',
            valid: false,
            expires: null,
            days_until_expiry: null,
            error: 'No certificate found'
          });
          return;
        }

        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const isValid = now >= validFrom && now <= validTo;
        const daysUntilExpiry = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

        let status = 'ok';
        if (!isValid) {
          status = 'expired';
        } else if (daysUntilExpiry <= 7) {
          status = 'warning';
        }

        resolve({
          type: 'ssl',
          url: target.url,
          name: target.name || target.url,
          status: status,
          valid: isValid,
          expires: Math.floor(validTo.getTime() / 1000),
          days_until_expiry: daysUntilExpiry,
          error: null
        });
      });

      socket.on('error', (err) => {
        resolve({
          type: 'ssl',
          url: target.url,
          name: target.name || target.url,
          status: 'error',
          valid: false,
          expires: null,
          days_until_expiry: null,
          error: err.message
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          type: 'ssl',
          url: target.url,
          name: target.name || target.url,
          status: 'error',
          valid: false,
          expires: null,
          days_until_expiry: null,
          error: 'Connection timeout'
        });
      });
    });
  } catch (err) {
    return {
      type: 'ssl',
      url: target.url,
      name: target.name || target.url,
      status: 'error',
      valid: false,
      expires: null,
      days_until_expiry: null,
      error: err.message
    };
  }
}

/**
 * Calculate file hash (SHA256)
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} SHA256 hash
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Check file status
 * @param {Object} target - Target configuration
 * @param {string} target.path - File path (local or UNC)
 * @param {boolean} [target.checkSize=true] - Check file size
 * @param {boolean} [target.checkHash=false] - Calculate file hash
 * @param {string} [target.expectedHash] - Expected hash value
 * @returns {Promise<Object>} Result with file info
 */
export async function checkFile(target) {
  try {
    const stats = await fsPromises.stat(target.path);

    if (!stats.isFile()) {
      return {
        type: 'file',
        path: target.path,
        name: target.name || path.basename(target.path),
        status: 'error',
        exists: true,
        is_file: false,
        size: null,
        created: null,
        modified: null,
        hash: null,
        hash_match: null,
        error: 'Path is not a file'
      };
    }

    const result = {
      type: 'file',
      path: target.path,
      name: target.name || path.basename(target.path),
      status: 'ok',
      exists: true,
      is_file: true,
      size: stats.size,
      created: Math.floor(stats.birthtimeMs / 1000),
      modified: Math.floor(stats.mtimeMs / 1000),
      hash: null,
      hash_match: null,
      error: null
    };

    // Calculate hash if requested
    if (target.checkHash) {
      try {
        result.hash = await calculateFileHash(target.path);

        // Check against expected hash if provided
        if (target.expectedHash) {
          result.hash_match = result.hash === target.expectedHash;
          if (!result.hash_match) {
            result.status = 'changed';
          }
        }
      } catch (err) {
        result.error = `Hash calculation failed: ${err.message}`;
        result.status = 'warning';
      }
    }

    return result;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        type: 'file',
        path: target.path,
        name: target.name || path.basename(target.path),
        status: 'missing',
        exists: false,
        is_file: null,
        size: null,
        created: null,
        modified: null,
        hash: null,
        hash_match: null,
        error: 'File not found'
      };
    }

    return {
      type: 'file',
      path: target.path,
      name: target.name || path.basename(target.path),
      status: 'error',
      exists: null,
      is_file: null,
      size: null,
      created: null,
      modified: null,
      hash: null,
      hash_match: null,
      error: err.message
    };
  }
}

/**
 * Check folder status
 * @param {Object} target - Target configuration
 * @param {string} target.path - Folder path (local or UNC)
 * @returns {Promise<Object>} Result with folder info
 */
export async function checkFolder(target) {
  try {
    const stats = await fsPromises.stat(target.path);

    if (!stats.isDirectory()) {
      return {
        type: 'folder',
        path: target.path,
        name: target.name || path.basename(target.path),
        status: 'error',
        exists: true,
        is_folder: false,
        file_count: null,
        total_size: null,
        error: 'Path is not a folder'
      };
    }

    // Read directory contents
    const files = await fsPromises.readdir(target.path);
    let totalSize = 0;
    let fileCount = 0;

    // Calculate total size and count files
    for (const file of files) {
      try {
        const filePath = path.join(target.path, file);
        const fileStats = await fsPromises.stat(filePath);

        if (fileStats.isFile()) {
          fileCount++;
          totalSize += fileStats.size;
        }
      } catch (err) {
        // Skip files we can't stat (permissions, etc.)
        continue;
      }
    }

    return {
      type: 'folder',
      path: target.path,
      name: target.name || path.basename(target.path),
      status: 'ok',
      exists: true,
      is_folder: true,
      file_count: fileCount,
      total_size: totalSize,
      error: null
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        type: 'folder',
        path: target.path,
        name: target.name || path.basename(target.path),
        status: 'missing',
        exists: false,
        is_folder: null,
        file_count: null,
        total_size: null,
        error: 'Folder not found'
      };
    }

    return {
      type: 'folder',
      path: target.path,
      name: target.name || path.basename(target.path),
      status: 'error',
      exists: null,
      is_folder: null,
      file_count: null,
      total_size: null,
      error: err.message
    };
  }
}

/**
 * Check a monitoring target based on its type
 * @param {Object} target - Target configuration
 * @returns {Promise<Object>} Check result
 */
export async function checkTarget(target) {
  switch (target.type) {
    case 'web':
      return await checkWebEndpoint(target);
    case 'ssl':
      return await checkSslCertificate(target);
    case 'file':
      return await checkFile(target);
    case 'folder':
      return await checkFolder(target);
    default:
      return {
        type: target.type,
        name: target.name || 'Unknown',
        status: 'error',
        error: `Unknown target type: ${target.type}`
      };
  }
}

/**
 * Load monitoring targets from JSON config file
 * @param {string} configPath - Path to config file
 * @returns {Promise<Array>} Array of target configurations
 */
export async function loadTargets(configPath) {
  try {
    const configData = await fsPromises.readFile(configPath, 'utf8');
    const config = JSON.parse(configData);
    return config.targets || [];
  } catch (err) {
    throw new Error(`Failed to load config from ${configPath}: ${err.message}`);
  }
}
