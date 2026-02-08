import firebase_admin
from firebase_admin import credentials, auth
import sys
import os
import json

def delete_user(email):
    # Path to the service account key
    cred_path = "./backend/accounts-service/src/main/resources/firebase-service-account.json"
    
    if not os.path.exists(cred_path):
        print(f"Error: Service account file not found at {cred_path}")
        sys.exit(1)

    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        
        try:
            user = auth.get_user_by_email(email)
            auth.delete_user(user.uid)
            print(f"Successfully deleted user {email} (UID: {user.uid}) from Firebase Authentication.")
        except auth.UserNotFoundError:
            print(f"User {email} not found in Firebase.")
            
    except Exception as e:
        print(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 delete_firebase_user.py <email>")
        sys.exit(1)
        
    email = sys.argv[1]
    delete_user(email)
