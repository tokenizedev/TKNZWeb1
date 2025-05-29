PHONY: ul create-pool

ul:
	./scripts/upsert-leaderboard.sh
create-pool:
	ts-node scripts/create-pool.ts --help
