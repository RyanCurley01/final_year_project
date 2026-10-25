import json
import os
from threading import Lock
from typing import Any

import bcrypt
import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials, HTTPBearer
from firebase_admin import auth, credentials

from database import get_db_connection


bearer_scheme = HTTPBearer(auto_error=False)
basic_scheme = HTTPBasic(auto_error=False)
_firebase_lock = Lock()


def _firebase_app():
    try:
        return firebase_admin.get_app()
    except ValueError:
        pass

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase authentication is not configured",
        )

    try:
        service_account = json.loads(service_account_json)
        with _firebase_lock:
            try:
                return firebase_admin.get_app()
            except ValueError:
                return firebase_admin.initialize_app(credentials.Certificate(service_account))
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase authentication configuration is invalid",
        ) from exc


def _load_account_by_firebase_uid(firebase_uid: str) -> dict[str, Any] | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT AccountType FROM Accounts WHERE FirebaseUID = %s LIMIT 1",
                (firebase_uid,),
            )
            return cursor.fetchone()


def _load_basic_account(email: str) -> dict[str, Any] | None:
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT AccountPassword, AccountType
                FROM Accounts
                WHERE AccountEmailAddress = %s
                LIMIT 1
                """,
                (email,),
            )
            return cursor.fetchone()


def require_manager(
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    basic: HTTPBasicCredentials | None = Depends(basic_scheme),
) -> dict[str, str]:
    if bearer is not None:
        try:
            decoded_token = auth.verify_id_token(bearer.credentials, app=_firebase_app())
        except (auth.InvalidIdTokenError, auth.ExpiredIdTokenError, auth.RevokedIdTokenError) as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Firebase ID token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

        account = _load_account_by_firebase_uid(decoded_token["uid"])
        if account is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not registered")
        account_type = account.get("AccountType")
    elif basic is not None:
        account = _load_basic_account(basic.username)
        stored_password = account.get("AccountPassword") if account else None
        try:
            password_matches = bool(stored_password) and bcrypt.checkpw(
                basic.password.encode("utf-8"),
                stored_password.encode("utf-8"),
            )
        except ValueError:
            password_matches = False
        if not password_matches:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )
        account_type = account.get("AccountType")
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not isinstance(account_type, str) or account_type.strip().casefold() != "manager":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager role required")

    return {"accountType": account_type}
