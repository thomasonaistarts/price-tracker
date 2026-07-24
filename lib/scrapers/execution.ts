export type AbortableExecution<T> =
  | { outcome: 'success'; value: T; durationMs: number }
  | { outcome: 'timeout'; error: Error; durationMs: number }
  | { outcome: 'error'; error: unknown; durationMs: number }

class OperationTimeoutError extends Error {
  constructor() {
    super('operation_timeout')
    this.name = 'OperationTimeoutError'
  }
}

export async function runAbortable<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<AbortableExecution<T>> {
  const startedAt = Date.now()
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false

  try {
    const value = await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
          reject(new OperationTimeoutError())
        }, timeoutMs)
      }),
    ])
    return { outcome: 'success', value, durationMs: Date.now() - startedAt }
  } catch (error) {
    return timedOut || error instanceof OperationTimeoutError
      ? {
          outcome: 'timeout',
          error: error instanceof Error ? error : new OperationTimeoutError(),
          durationMs: Date.now() - startedAt,
        }
      : { outcome: 'error', error, durationMs: Date.now() - startedAt }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runSequentialUntil<T>(
  jobs: Array<() => Promise<T>>,
  shouldStop: (result: T) => boolean,
): Promise<T[]> {
  const results: T[] = []

  for (const job of jobs) {
    const result = await job()
    results.push(result)
    if (shouldStop(result)) break
  }

  return results
}

const queueTails = new Map<string, Promise<void>>()

export async function runInNamedQueue<T>(
  queueName: string,
  job: () => Promise<T>,
): Promise<T> {
  const previous = queueTails.get(queueName) ?? Promise.resolve()
  let release: (() => void) | undefined
  const current = new Promise<void>(resolve => { release = resolve })
  queueTails.set(queueName, current)

  await previous
  try {
    return await job()
  } finally {
    release?.()
    if (queueTails.get(queueName) === current) {
      queueTails.delete(queueName)
    }
  }
}
