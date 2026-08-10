# Contributing to StellarUrithi-Bidz

## Setup
1. Fork and clone: `git clone https://github.com/YOUR_USERNAME/StellarUrithi-Bidz.git`
2. Follow README.md setup instructions
3. Branch: `git checkout -b feat/your-feature`

## Contracts
```bash
cd contracts
cargo fmt --all -- --check
cargo clippy --target wasm32-unknown-unknown -- -D warnings
cargo test  # All 16 must pass
```

## Backend
```bash
cd backend
npx tsc --noEmit && npm test
```

## Frontend
```bash
cd frontend
npx tsc --noEmit && npm test
```

## Commit Convention
- `feat(scope):` new feature | `fix(scope):` bug fix
- `docs(scope):` docs | `test(scope):` tests
- `refactor(scope):` code change | `chore(scope):` tooling

## PR Process
1. All tests pass
2. Type checks pass
3. Update CHANGELOG.md
4. Submit against main

MIT License — by contributing you agree to MIT terms.
