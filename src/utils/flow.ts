// Scheduling logic for the "Flow" action: walks today's remaining tasks in
// order and caps every back-to-back run of them at 90 minutes, inserting a
// 15-minute break right after the task that would otherwise push a run over
// that cap. A run resets wherever the original schedule already has a gap
// between two tasks (including a gap left by an existing break), so Flow
// never doubles up on breaks that are already there.

export const FLOW_MAX_BLOCK_MINUTES = 90
export const FLOW_BREAK_MINUTES = 15

export interface FlowTask {
  id: string
  start: Date
  end: Date
}

export interface FlowTaskUpdate {
  id: string
  start: Date
  end: Date
}

export interface FlowBreak {
  start: Date
  end: Date
}

export interface FlowResult {
  taskUpdates: FlowTaskUpdate[]
  breaksToInsert: FlowBreak[]
}

export function computeFlowSchedule(tasks: FlowTask[]): FlowResult {
  const sortedTasks = [...tasks].sort((a, b) => a.start.getTime() - b.start.getTime())

  const taskUpdates: FlowTaskUpdate[] = []
  const breaksToInsert: FlowBreak[] = []

  let shiftMs = 0
  let blockMinutes = 0
  let previousOriginalEnd: Date | null = null

  for (const task of sortedTasks) {
    const durationMs = task.end.getTime() - task.start.getTime()
    const durationMinutes = durationMs / 60000

    if (previousOriginalEnd && task.start.getTime() > previousOriginalEnd.getTime()) {
      blockMinutes = 0
    }

    let start = new Date(task.start.getTime() + shiftMs)

    if (blockMinutes > 0 && blockMinutes + durationMinutes > FLOW_MAX_BLOCK_MINUTES) {
      const breakStart = start
      const breakEnd = new Date(breakStart.getTime() + FLOW_BREAK_MINUTES * 60000)
      breaksToInsert.push({ start: breakStart, end: breakEnd })

      shiftMs += FLOW_BREAK_MINUTES * 60000
      start = new Date(task.start.getTime() + shiftMs)
      blockMinutes = 0
    }

    const end = new Date(start.getTime() + durationMs)
    taskUpdates.push({ id: task.id, start, end })

    blockMinutes += durationMinutes
    previousOriginalEnd = task.end
  }

  return { taskUpdates, breaksToInsert }
}
