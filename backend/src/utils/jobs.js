const queue = [];
const pendingKeys = new Set();
let active = 0;
const MAX_ACTIVE = 2;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    const job = queue.shift();
    active += 1;
    Promise.resolve()
      .then(job.fn)
      .catch((error) => {
        console.error(`Background job ${job.key} failed:`, error);
      })
      .finally(() => {
        pendingKeys.delete(job.key);
        active -= 1;
        pump();
      });
  }
}

function enqueue(key, fn) {
  if (pendingKeys.has(key)) return;
  pendingKeys.add(key);
  queue.push({ key, fn });
  pump();
}

module.exports = { enqueue };
