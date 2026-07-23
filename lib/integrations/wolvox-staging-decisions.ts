export type WolvoxStagingDecision = 'exclude' | 'use_sku'

export interface WolvoxIssueForDecision {
  external_id: string
  status: 'invalid' | 'conflict'
}

export interface WolvoxDecisionSummary {
  invalid: number
  conflict: number
  excluded: number
  useSku: number
  unresolvedInvalid: number
  unresolvedConflict: number
}

export function sanitizeWolvoxStagingDecisions(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, WolvoxStagingDecision>
  }

  const decisions: Record<string, WolvoxStagingDecision> = {}
  for (const [externalId, decision] of Object.entries(value)) {
    const normalizedId = externalId.trim().slice(0, 200)
    if (!normalizedId || (decision !== 'exclude' && decision !== 'use_sku')) continue
    decisions[normalizedId] = decision
  }
  return decisions
}

export function summarizeWolvoxStagingDecisions(
  issues: WolvoxIssueForDecision[],
  decisions: Record<string, WolvoxStagingDecision>,
): WolvoxDecisionSummary {
  const summary: WolvoxDecisionSummary = {
    invalid: 0,
    conflict: 0,
    excluded: 0,
    useSku: 0,
    unresolvedInvalid: 0,
    unresolvedConflict: 0,
  }

  for (const issue of issues) {
    const decision = decisions[issue.external_id]
    if (issue.status === 'invalid') {
      summary.invalid += 1
      if (decision === 'exclude') summary.excluded += 1
      else summary.unresolvedInvalid += 1
      continue
    }

    summary.conflict += 1
    if (decision === 'exclude') summary.excluded += 1
    else if (decision === 'use_sku') summary.useSku += 1
    else summary.unresolvedConflict += 1
  }

  return summary
}
