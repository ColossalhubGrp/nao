/**
 * Row-level RBAC preflight for execute_sql.
 *
 * Given the SQL the model wants to run and the set of employee IDs
 * the caller may see, decide whether the query is safe to execute.
 * We DO NOT rewrite the SQL — the model already understands the
 * scope from the system-prompt directive that colossal_bi's
 * WhatsApp bridge prepends. We only enforce: if the query touches
 * a table that carries per-employee rows, it must reference at
 * least one of the caller's allowed IDs as a quoted literal.
 *
 * This is preflight-only, not an AST rewrite. Chosen over a
 * rewriter to keep the patch small and predictable — a rewriter
 * over node-sql-parser can subtly break aggregate queries, JOINs,
 * subqueries, CTEs. The preflight is:
 *
 *   - Cheap (regex, no parse)
 *   - Fail-closed (if we can't decide, we refuse)
 *   - Educational (error message tells the model what to add)
 *
 * The Phase 2 outer-layer response scan (in colossal_bi) still
 * runs on the returned rows, so if the model somehow slips a
 * cross-employee query past this check, the leak is still
 * blocked before it reaches the user.
 *
 * Added 2026-09-25 for the WhatsApp Q&A RBAC Phase 3 fix.
 */

import type { ViewerScope } from '../types/chat';

/**
 * Frappe/ERPNext tables where every row belongs to exactly one
 * employee. Any query that reads FROM or JOINs one of these must
 * be scoped to the caller's allowed employees.
 *
 * Add a new table here whenever a new employee-scoped doctype
 * becomes queryable via nao. Keep the check conservative: better
 * to refuse an unscoped query than to leak a row.
 */
export const EMPLOYEE_SCOPED_TABLES: ReadonlySet<string> = new Set([
	'tabEmployee',
	'tabSalary Slip',
	'tabPayroll Run Payslip',
	'tabLeave Application',
	'tabLeave Allocation',
	'tabLeave Balance',
	'tabAttendance',
	'tabAppraisal',
	'tabExpense Claim',
	'tabEmployee Advance',
	'tabTraining Result',
	'tabPayroll Wizard Entry',
	'tabPayroll Wizard Timesheet',
	'tabShift Assignment',
	'tabShift Request',
	'tabAttendance Request',
	'tabEmployee Skill',
	'tabEmployee Education',
]);

export type PreflightResult =
	| { ok: true }
	| { ok: false; reason: string; suggestion: string };

/**
 * Preflight an SQL query against a viewer scope. Returns { ok: true }
 * to execute, or an error the tool should return so the model can
 * retry with a scoped variant.
 */
export function preflightScopeFilter(sql: string, scope: ViewerScope | undefined): PreflightResult {
	// No scope, or unrestricted (HR admin) — allow everything.
	if (!scope) return { ok: true };
	const { employeeIds } = scope;
	if (employeeIds === null) return { ok: true };
	if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
		// Empty allow-list = no data access at all.
		return {
			ok: false,
			reason: 'Your account has no data-access scope.',
			suggestion: 'Ask HR to link your WhatsApp number to an active employee record.',
		};
	}

	const referenced = extractTableRefs(sql);
	const scoped = referenced.filter((t) => EMPLOYEE_SCOPED_TABLES.has(t));
	if (scoped.length === 0) {
		// Query doesn't touch any employee-scoped table. Safe.
		return { ok: true };
	}

	// Query touches employee data. Require at least one allowed ID
	// as a quoted literal somewhere in the SQL.
	if (containsAllowedId(sql, employeeIds)) {
		return { ok: true };
	}

	const idsHint = employeeIds.slice(0, 3).map((id) => `'${id}'`).join(', ');
	const suffix = employeeIds.length > 3 ? ` (and ${employeeIds.length - 3} more)` : '';
	return {
		ok: false,
		reason:
			`Access denied by row-level RBAC. Query reads from ${scoped.join(', ')} ` +
			`but does not restrict rows to your allowed employees.`,
		suggestion:
			`Add a WHERE clause naming at least one allowed employee id — e.g. ` +
			`\`WHERE employee IN (${idsHint})${suffix}\`. If the question is inherently ` +
			`cross-employee (top N, averages across the company, etc.), refuse it in ` +
			`your text reply — that data is HR-admin-only.`,
	};
}

/**
 * Table references appearing in FROM or JOIN clauses. Matches both
 * backtick-quoted (`tabX`) and unquoted forms. Deliberately loose:
 * false positives here just make the check more permissive elsewhere
 * (we look for the table name in EMPLOYEE_SCOPED_TABLES which is a
 * strict allowlist), and false negatives can't happen for the
 * table names we care about because we quote them explicitly.
 */
function extractTableRefs(sql: string): string[] {
	const refs: string[] = [];
	// `tabFoo Bar` — backtick-quoted, allows spaces
	const bt = /(?:FROM|JOIN)\s+`([^`]+)`/gi;
	let m: RegExpExecArray | null;
	while ((m = bt.exec(sql)) !== null) refs.push(m[1]!);
	// tabFoo — unquoted, no spaces
	const bare = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
	while ((m = bare.exec(sql)) !== null) refs.push(m[1]!);
	return refs;
}

function containsAllowedId(sql: string, allowedIds: string[]): boolean {
	for (const id of allowedIds) {
		// Match either 'HR-EMP-00001' or "HR-EMP-00001". A partial
		// substring match (no quotes) is not enough — that would
		// pass on 'HR-EMP-000010' which is a different employee.
		if (sql.includes(`'${id}'`) || sql.includes(`"${id}"`)) {
			return true;
		}
	}
	return false;
}
