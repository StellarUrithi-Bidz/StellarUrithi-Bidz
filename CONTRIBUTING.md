# Contributing to StellarUrithi-Bidz

Thank you for your interest in contributing to StellarUrithi-Bidz! We welcome contributions from developers, security researchers, designers, and cultural preservation enthusiasts.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md) (adapted from Contributor Covenant v2.1). Please review it prior to engaging in discussions or contributing code.

---

## Development Workflow

1. **Fork & Clone**
   ```bash
   git clone https://github.com/StellarUrithi-Bidz/StellarUrithi-Bidz.git
   cd StellarUrithi-Bidz
   ```

2. **Branching Strategy**
   Create a topic branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

3. **Layer-Specific Verification**

   - **Soroban Contracts:**
     ```bash
     cd contracts
     cargo fmt --all -- --check
     cargo clippy --target wasm32-unknown-unknown -- -D warnings
     cargo test
     ```
     Ensure all unit tests pass before committing.

   - **Backend Indexer & REST API:**
     ```bash
     cd backend
     npx tsc --noEmit
     npm test
     ```

   - **Frontend UI:**
     ```bash
     cd frontend
     npx tsc --noEmit
     npm test
     ```

   - **Custodian Portal:**
     ```bash
     cd custodian-portal
     npx tsc --noEmit
     npm test
     ```

---

## Commit Guidelines

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat(scope):` A new feature or user-facing capability.
- `fix(scope):` A bug fix or security patch.
- `test(scope):` Adding or expanding test suites.
- `refactor(scope):` Code changes that neither fix a bug nor add a feature.
- `docs(scope):` Documentation additions or edits.
- `ci(scope):` Changes to CI/CD pipelines and workflows.
- `chore(scope):` Maintenance, dependencies, or repository cleanup.

**Scopes:** `contracts`, `indexer`, `api`, `ws`, `frontend`, `custodian`, `docker`, `docs`.

**Example:**
```
fix(contracts): switch dynamic storage to persistent with TTL extension
feat(frontend): implement real on-chain bidding and pull refund withdrawal
docs(security): add comprehensive threat model and reporting procedure
```

---

## Smart Contract Guidelines

When contributing to `contracts/`:
- **Persistent Storage:** Never store unbounded or dynamic items in `instance()` storage (which is limited to 64KB on Soroban). Always use `persistent()` storage with proactive TTL extension (`extend_ttl`).
- **Pull Over Push Escrow:** Never send funds directly inside loops or to multiple recipients during outbid events. Always credit claimable balances via the pull-payment pattern.
- **Explicit Panics & Error Handling:** Return informative panic messages instead of generic unwrap failures.
- **Event Emission:** Emit typed events for all state transitions (`bid_placed`, `auction_closed`, `auction_settled`, `auction_extended`, `attestation_recorded`).

---

## Pull Request Checklist

Before submitting your pull request:
- [ ] Code is formatted and passes linting checks (`cargo fmt`, `clippy`, `tsc`).
- [ ] All 19 contract tests and frontend/backend unit tests pass cleanly.
- [ ] Meaningful and atomic commits following Conventional Commits format.
- [ ] New features or fixes include automated test coverage.
- [ ] Updated documentation or `CHANGELOG.md` where applicable.

---

## License

By contributing to StellarUrithi-Bidz, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
