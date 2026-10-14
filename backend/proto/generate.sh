#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p generated
python -m grpc_tools.protoc \
  -I proto \
  --python_out=generated \
  --grpc_python_out=generated \
  proto/inventory.proto proto/orders.proto
printf '%s\n' "Generated Python gRPC stubs in backend/generated/ (do not edit them by hand)."
