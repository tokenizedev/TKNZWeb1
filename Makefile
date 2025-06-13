PHONY: ul create-pool

ul:
	./scripts/upsert-leaderboard.sh
create-pool:
	ts-node scripts/create-pool.ts --help
test-devnet:
	ts-node scripts/test-devnet.ts
create-static-config:
	ts-node scripts/create-static-config.ts --help
