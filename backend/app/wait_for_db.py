import logging
import time

from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.db import engine

logger = logging.getLogger("shoppasto.database")


def wait_for_database() -> None:
    attempts = 30
    for attempt in range(1, attempts + 1):
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("PostgreSQL está disponible.")
            return
        except OperationalError:
            if attempt == attempts:
                raise
            logger.info("Esperando PostgreSQL (%s/%s).", attempt, attempts)
            time.sleep(2)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    wait_for_database()
