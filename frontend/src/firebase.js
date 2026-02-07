import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#config-object
const firebaseConfig = {
  apiKey: "AIzaSyC2QimU9qsYmd8bMNNWxj8uy_eLe0fBINo",
  authDomain: "final-year-project-33005.firebaseapp.com",
  projectId: "final-year-project-33005",
  storageBucket: "final-year-project-33005.firebasestorage.app",
  messagingSenderId: "118008106517",
  appId: "1:118008106517:web:e2770c27fdc1712990c81c",
  measurementId: "G-XSFNSPEV0J"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

export { auth };
