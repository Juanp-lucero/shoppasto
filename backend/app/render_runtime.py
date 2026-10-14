"""Run the REST gateway and its private gRPC services in one Render instance."""

import logging
import os
import signal
import socket
import subprocess
import sys
import time


LOGGER = logging.getLogger("shoppasto.render")
SHUTTING_DOWN = False


def _request_shutdown(signum, _frame) -> None:
    global SHUTTING_DOWN
    LOGGER.info("Received signal %s; stopping ShopPasto services.", signum)
    SHUTTING_DOWN = True


def _wait_for_port(name: str, process: subprocess.Popen, port: int, timeout: float = 30) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        exit_code = process.poll()
        if exit_code is not None:
            raise RuntimeError(f"{name} exited before opening port {port} (code {exit_code}).")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                LOGGER.info("%s is listening on 127.0.0.1:%s.", name, port)
                return
        except OSError:
            time.sleep(0.25)
    raise TimeoutError(f"{name} did not open port {port} within {timeout:g} seconds.")


def _stop_processes(processes: list[tuple[str, subprocess.Popen]]) -> None:
    for name, process in reversed(processes):
        if process.poll() is None:
            LOGGER.info("Stopping %s.", name)
            process.terminate()

    for name, process in reversed(processes):
        if process.poll() is None:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                LOGGER.warning("%s did not stop in time; killing it.", name)
                process.kill()
                process.wait(timeout=5)


def run() -> int:
    global SHUTTING_DOWN
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    signal.signal(signal.SIGTERM, _request_shutdown)
    signal.signal(signal.SIGINT, _request_shutdown)

    inventory_port = int(os.getenv("INVENTORY_GRPC_PORT", "50051"))
    orders_port = int(os.getenv("ORDERS_GRPC_PORT", "50052"))
    api_port = int(os.getenv("PORT", "10000"))
    env = os.environ.copy()
    env["INVENTORY_GRPC_PORT"] = str(inventory_port)
    env["ORDERS_GRPC_PORT"] = str(orders_port)
    env["INVENTORY_GRPC_TARGET"] = f"127.0.0.1:{inventory_port}"
    env["ORDERS_GRPC_TARGET"] = f"127.0.0.1:{orders_port}"

    processes: list[tuple[str, subprocess.Popen]] = []
    try:
        LOGGER.info("Waiting for PostgreSQL before migrating and seeding.")
        subprocess.run([sys.executable, "-m", "app.wait_for_db"], check=True, env=env)
        subprocess.run(["alembic", "upgrade", "head"], check=True, env=env)
        subprocess.run([sys.executable, "-m", "app.seed"], check=True, env=env)

        inventory = subprocess.Popen(
            [sys.executable, "-m", "services.inventory.server"],
            env=env,
        )
        processes.append(("Inventory gRPC", inventory))
        _wait_for_port("Inventory gRPC", inventory, inventory_port)

        orders = subprocess.Popen(
            [sys.executable, "-m", "services.orders.server"],
            env=env,
        )
        processes.append(("Orders gRPC", orders))
        _wait_for_port("Orders gRPC", orders, orders_port)

        api = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "gateway.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                str(api_port),
            ],
            env=env,
        )
        processes.append(("FastAPI", api))
        LOGGER.info("ShopPasto API starting on port %s.", api_port)

        while not SHUTTING_DOWN:
            for name, process in processes:
                exit_code = process.poll()
                if exit_code is not None:
                    LOGGER.error("%s exited unexpectedly with code %s.", name, exit_code)
                    return exit_code or 1
            time.sleep(0.5)
        return 0
    except Exception:
        LOGGER.exception("ShopPasto failed to start.")
        return 1
    finally:
        _stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(run())
