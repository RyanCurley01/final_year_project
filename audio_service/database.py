# audio_service/database.py
import pymysql
from contextlib import contextmanager
from config import DB_CONFIG
from utils import console

# EXECUTION ORDER: Independent setup.
DB_CONFIG_REAL = DB_CONFIG.copy()
DB_CONFIG_REAL['cursorclass'] = pymysql.cursors.DictCursor

# EXECUTION ORDER: Called whenever a DB operation is needed.
# Must be used within a 'with' statement.
@contextmanager
def get_db_connection():
    """Context manager for database connections with automatic cleanup"""
    connection = None
    try:
        connection = pymysql.connect(**DB_CONFIG_REAL)
        yield connection
    except pymysql.Error as e:
        console.log(f"Database connection error: {e}")
        # Explicitly re-raise to avoid 'generator didn't stop' error
        raise
    finally:
        if connection:
            connection.close()
