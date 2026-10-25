import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBasicCredentials

from security import require_manager


class RequireManagerTests(unittest.TestCase):
    def test_accepts_firebase_manager_from_account_record(self):
        bearer = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        with (
            patch("security._firebase_app"),
            patch("security.auth.verify_id_token", return_value={"uid": "manager-uid"}),
            patch("security._load_account_by_firebase_uid", return_value={"AccountType": "Manager"}),
        ):
            result = require_manager(bearer=bearer, basic=None)

        self.assertEqual(result["accountType"], "Manager")

    def test_rejects_firebase_customer(self):
        bearer = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
        with (
            patch("security._firebase_app"),
            patch("security.auth.verify_id_token", return_value={"uid": "customer-uid"}),
            patch("security._load_account_by_firebase_uid", return_value={"AccountType": "Customer"}),
        ):
            with self.assertRaises(HTTPException) as raised:
                require_manager(bearer=bearer, basic=None)

        self.assertEqual(raised.exception.status_code, 403)

    def test_accepts_basic_manager_with_matching_password_hash(self):
        basic = HTTPBasicCredentials(username="manager@example.com", password="password")
        with (
            patch("security._load_basic_account", return_value={
                "AccountPassword": "$2b$hashed",
                "AccountType": "Manager",
            }),
            patch("security.bcrypt.checkpw", return_value=True),
        ):
            result = require_manager(bearer=None, basic=basic)

        self.assertEqual(result["accountType"], "Manager")

    def test_requires_authentication(self):
        with self.assertRaises(HTTPException) as raised:
            require_manager(bearer=None, basic=None)

        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
