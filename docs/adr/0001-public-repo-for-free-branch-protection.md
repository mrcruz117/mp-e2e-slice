# The repo is public to get free branch protection

GitHub Free does not offer branch protection or rulesets on private repositories —
they require Pro or above. This project's central control is a server-side merge
gate that an agent cannot bypass, so an unenforceable gate would defeat the point
of the experiment.

Making the repo public turns on branch protection, required status checks, and
`CODEOWNERS` at no cost. The alternative was GitHub Pro at $4/month, rejected
because this is a throwaway experiment and paying to keep it private is backwards.

## Consequences

Nothing secret may ever be committed here. Deploy credentials live in Actions
secrets, which stay private on public repositories. Reverting to private silently
removes every merge gate rather than failing loudly — check the gates still exist
if the visibility ever changes.
