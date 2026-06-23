/**
 * @typedef {Object} CommandMetadata
 * @property {string} name
 * @property {string[]} aliases
 * @property {string} category
 * @property {string} summary
 * @property {string} description
 * @property {boolean} readOnly
 * @property {boolean} destructive
 * @property {boolean} concurrencySafe
 * @property {boolean} supportsJson
 * @property {boolean} supportsExplain
 * @property {boolean} requiresUserInteraction
 * @property {boolean} requiresFreshIndex
 * @property {boolean} acceptsHumanRef
 * @property {boolean} acceptsPaths
 * @property {number} maxResultSizeChars
 * @property {string[]} examples
 */

/**
 * @typedef {Object} SubcommandContract
 * @property {string} id Stable command.action identifier.
 * @property {string} command Top-level command name.
 * @property {string} action Subcommand or routed action.
 * @property {"intake"|"knowledge"|"work"|"graph"|"system"} domain Product domain.
 * @property {string} summary Human-readable action summary.
 * @property {string} usage Full CLI usage string.
 * @property {boolean} readOnly Whether this action avoids mutation.
 * @property {string|null} lockScope Lock name required before execution.
 * @property {string[]} roleTags Capability tags consumed by generated agent roles.
 * @property {boolean} dashboard Whether the action is eligible for dashboard surfacing.
 * @property {string[]} lifecycleEffects Entity lifecycle effects caused by the action.
 * @property {string[]} requiredEvidence Evidence fields required before terminal transitions.
 * @property {string[]} examples Concrete CLI examples.
 */

export {};
