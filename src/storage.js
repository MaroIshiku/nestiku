'use strict';

const fs = require('fs').promises;
const path = require('path');

class JsonStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const value = structuredCloneCompat(this.defaults);
      await this.write(value);
      return value;
    }
  }

  write(value) {
    const task = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
      try {
        await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        await fs.rename(tmp, this.filePath);
      } catch (error) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = JsonStore;
