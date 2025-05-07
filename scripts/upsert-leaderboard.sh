#! /bin/bash

LOG_FILE="logs/upsert-leaderboard-$(date +%Y-%m-%d-%H-%M-%S).log"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to clean up processes
cleanup() {
  echo "Caught signal. Cleaning up..."
  # Kill the node process if it's still running
  if ps -p $NODE_PID > /dev/null; then
    kill $NODE_PID 2>/dev/null
  fi
  # Kill the tail process if it's still running
  if ps -p $TAIL_PID > /dev/null; then
    kill $TAIL_PID 2>/dev/null
  fi
  echo "Cleanup complete."
  exit 0
}

# Start the node process and capture its PID
node bin/upsert-leaderboard.js > $LOG_FILE 2>&1 &
NODE_PID=$!

# Set trap for signals
trap cleanup SIGINT SIGTERM

# Start tailing the log file
echo "Process started with PID: $NODE_PID. Monitoring logs in $LOG_FILE..."
tail -f $LOG_FILE &
TAIL_PID=$!

# Monitor the node process and exit when it completes
while ps -p $NODE_PID > /dev/null; do
  sleep 1
done

# Node process finished, kill the tail process
if ps -p $TAIL_PID > /dev/null; then
  kill $TAIL_PID 2>/dev/null
fi

echo "Process completed successfully."
