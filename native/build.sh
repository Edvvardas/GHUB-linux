#!/usr/bin/env bash
set -euo pipefail
native_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
g++ -std=c++17 -O2 -Wall -Wextra -shared -fPIC -I/usr/include/node "$native_dir/addon.cc" -o "$native_dir/linux_input.node"
