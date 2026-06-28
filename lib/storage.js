'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Simple JSON-on-disk storage with atomic writes and default fallback.
 * Writes go to a .tmp file and are renamed into place to avoid partial writes.
 */
class Storage {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
    this._writeQueue = Promise.resolve(); // serializes writes
  }

  async read() {
    try {
      const text = await fs.readFile(this.filePath, 'utf8');
      return JSON.parse(text);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // First run: seed with defaults
        const seed = JSON.parse(JSON.stringify(this.defaults));
        await this.write(seed);
        return seed;
      }
      throw err;
    }
  }

  write(data) {
    const writeTask = this._writeQueue.then(async () => {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      try {
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        await fs.rename(tmpPath, this.filePath);
      } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw err;
      }
    });
    this._writeQueue = writeTask.catch(() => {});
    return writeTask;
  }
}

module.exports = Storage;
