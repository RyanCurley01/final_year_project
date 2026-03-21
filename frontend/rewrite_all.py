import os

register_code = """import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';
import { FcGoogle } from "react-icons/fc";

// Declares and exports the Register functional React component so it can be imported and used in the router configuration.
export default function Register() {
  // Creates references attached to the form inputs, allowing direct reads of the values without tracking keystrokes in state.
  const emailRef = useRef();
  const passwordRef = useRef();
  const passwordConfirmRef = useRef();
  const nameRef = useRef();
  const phoneRef = useRef();
  
  // Destructures required authentication functions (signup, loginWithGoogle) and sync methods from the global AuthContext.
  const { signup, login, loginWithGoogle, syncWithBackend, setUser } = useAuth();
  
  // Initializes state variables to display a red error message if registration fails, and a loading flag to disable buttons during network requests.
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Asynchronous function triggered when the user clicks 'Sign up with Google'.
  async function handleGoogleRegister() {
    try {
      // Clears existing errors and sets loading to true to prevent duplicate submissions.
      setError("");
      setLoading(true);

      console.log("DEBUG: Starting Google Popup Register...");
      // Calls the Firebase Google SSO popup method. Execution pauses here until the user logs into the Google popup.
      const result = await loginWithGoogle();
      
      if (result && result.user) {
          // Sync with backend (will create account if not exists)
          // Grabs the newly created Firebase user, extracts the token, and sends it to the Spring Boot backend to record them in the Accounts table.
          await syncWithBackend(result.user);
          console.log("DEBUG: Backend sync complete, navigating to home");
          // Redirects the user to the home page upon successful full-stack registration.
          navigate("/");
      }
    } catch (err) {
      console.error("Google register failed", err);
      // Intercepts specific Firebase failure codes and sets user-friendly error messages to display on the screen.
      if (err.code === 'auth/popup-closed-by-user') {
          setError("Sign in cancelled");
      } else if (err.message && err.message.includes("Cross-Origin-Opener-Policy")) {
          setError("Browser security policy blocked the popup. Please try again.");
      } else {
          setError("Failed to register with Google: " + err.message);
      }
    } finally {
      // Ensures the buttons are re-enabled whether the registration succeeded or failed.
      setLoading(false);
    }
  }

  // Triggered when the standard HTML form is submitted, calling e.preventDefault() to stop the browser from reloading the page.
  async function handleSubmit(e) {
    e.preventDefault();

    // Validation check: Ensures the user typed the exact same string in the 'Password' and 'Password Confirmation' inputs.
    if (passwordRef.current.value !== passwordConfirmRef.current.value) {
      return setError('Passwords do not match');
    }

    try {
      setError('');
      setLoading(true);
      // 1. Create user in Firebase or identify existing
      let user;
      try {
        // Unpacks the literal text typed into the inputs and executes Firebase's native createUserWithEmailAndPassword method.
        const userCredential = await signup(emailRef.current.value, passwordRef.current.value);
        user = userCredential.user;
      } catch (signupErr) {
        // Checks if Firebase rejected the signup because the email is already registered and halts if true.
        if (signupErr.code === 'auth/email-already-in-use') {
          setError('Email already exists. Please login.');
          setLoading(false);
          return;
        } else {
          throw signupErr;
        }
      }

      // Requests a secure, digitally signed JWT from Firebase. The backend requires this to prove the user actually authenticated.
      const token = await user.getIdToken();
      console.log("DEBUG (Register): Obtained Firebase Token:", token ? `${token.substring(0, 20)}...[truncated]` : "null");
      console.log("DEBUG (Register): User:", user.uid, user.email);
      
      // 2. Sync with backend
      const phoneNumber = phoneRef.current.value || "";
      console.log("DEBUG (Register): Syncing with backend...", { name: nameRef.current.value, phoneNumber });
      
      // Sends the retrieved Firebase Token, UID, and details to the custom Spring Boot backend to create the MySQL identity mapping.
      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid, nameRef.current.value, phoneNumber);
      
      // 3. Store user details (include firebaseUid so wishlist uses Firebase token auth,
      //    not Basic Auth — the backend stores a random password for Firebase users)
      // Updates the global React Context and localStorage to acknowledge the user is signed in, merging DB logic with the Firebase UID.
      setUser({
        ...backendUser,
        firebaseUid: user.uid,
        password: passwordRef.current.value,
      });

      // Redirects the new validated user safely to the home dashboard.
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Failed to create an account: ' + (err.message || 'Unknown error'));
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-900 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-center">Sign Up</h2>
        {error && <div className="p-3 text-red-500 bg-red-100 rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Name</label>
            <input
              type="text"
              ref={nameRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              ref={emailRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone Number (Optional)</label>
            <input
              type="tel"
              ref={phoneRef}
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              ref={passwordRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
           <div>
            <label className="block text-sm font-medium">Password Confirmation</label>
            <input
              type="password"
              ref={passwordConfirmRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <button
            disabled={loading}
            type="submit"
            className="w-full py-2 font-bold text-white bg-cyan-600 rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Sign Up
          </button>
        </form>

        <div className="flex items-center justify-between my-4">
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
          <span className="text-xs text-center text-gray-400 uppercase">or</span>
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
        </div>

        <button
            disabled={loading}
            onClick={handleGoogleRegister}
            className="w-full flex items-center justify-center py-2 font-bold text-gray-900 bg-white rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
          >
            <FcGoogle className="mr-2 text-2xl" />
            Sign up with Google
        </button>

        <div className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-cyan-400 hover:text-cyan-300">Log In</Link>
        </div>
      </div>
    </div>
  );
}"""

login_code = """import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';
import { FcGoogle } from "react-icons/fc";

// Main Login component executing dual-mode authentication resolving standard DB forms and Firebase SSO popups.
export default function Login() {
  // Binds generic variable hooks bridging direct HTML input nodes cleanly, avoiding unnecessary re-renders.
  const emailRef = useRef();
  const passwordRef = useRef();
  
  // Extracts context functions responsible for talking natively with Firebase APIs directly from global Auth state.
  const { login, loginWithGoogle, syncWithBackend, setUser } = useAuth();
  
  // Stores error strings indicating to the user why the login execution pipeline failed locally.
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Asynchronous wrapper calling Firebase's specialized logic initializing secure external Google authentication loops.
  async function handleGoogleLogin() {
    try {
      setError("");
      setLoading(true);
      
      console.log("DEBUG: Starting Google Popup Login...");
      // Pauses execution while the Firebase SDK loads the Google Auth popup window. Returns user object if successful.
      const result = await loginWithGoogle();
      console.log("DEBUG: Popup finished, user:", result?.user?.email);
      
      if (result && result.user) {
          // Relays the secure Firebase user data against the Spring Boot API, associating external tokens with internal MySQL IDs.
          await syncWithBackend(result.user);
          console.log("DEBUG: Backend sync complete, navigating to home");
          navigate("/");
      }
    } catch (err) {
      console.error("Google login failed", err);
      // Suppresses native Cross-Origin browser UI bugs blocking Firebase execution loops visually.
      if (err.code === 'auth/popup-closed-by-user') {
          setError("Sign in cancelled");
      } else if (err.message && err.message.includes("Cross-Origin-Opener-Policy")) {
          // This is a browserpolicy header issue, but often the login actually SUCCEEDED in the background.
          // However, if we are in the catch block, the promise rejected.
          // We can try to recover if onAuthStateChanged picks it up, but usually we just show error.
          setError("Browser security policy blocked the popup. Please try again or use a different browser.");
      } else {
          setError("Failed to sign in with Google: " + err.message);
      }
    } finally {
      // If we navigated, this might run on unmounted component, which is fine/ignored
      setLoading(false);
    }
  }

  // Orchestrates standard non-SSO logins executing fallback logic validating raw user-entered text locally against systems.
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const email = emailRef.current.value;
    const password = passwordRef.current.value;

    try {
      // 1. Try Firebase Login
      // Invokes Firebase with the typed credentials, throwing an error if the user isn't found in their remote auth registry.
      const userCredential = await login(email, password);
      const user = userCredential.user;
      
      // Pulls the verifiable JSON Web Token assigned by Firebase ensuring Spring Boot accepts the session state.
      const token = await user.getIdToken();
      console.log("DEBUG (Login): Obtained Firebase Token:", token ? `${token.substring(0, 20)}...[truncated]` : "null");

      // 2. Sync/Login with backend
      // Transmits the token payload matching the confirmed Firebase session to our Account Service retrieving Account types (Admin vs User).
      console.log("DEBUG (Login): Calling accountService.firebaseLogin");
      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid);
      
      // 3. Store user details
      // Combines the local DB payload structure and the external Firebase user UID safely caching values inside context.
      setUser({
        ...backendUser,
        firebaseUid: user.uid,
        password,
      });

      navigate('/');
    } catch (firebaseErr) {
      console.warn("Firebase login failed, attempting legacy login...", firebaseErr);
      
      try {
        // 4. Fallback to Legacy Backend Login
        // Executes standard web REST logic hitting the legacy backend endpoint skipping Firebase entirely if old rows exist.
        const response = await accountService.login(email, password);
        
        if (response.success) {
          // Re-maps explicit primitive properties bridging structural legacy Account payloads correctly for modern application states.
          const legacyUser = {
            id: response.accountId,
            accountName: response.accountName,
            accountType: response.accountType,
            accountEmailAddress: response.email,
            password,
            // Legacy users have no firebaseUid
          };
          setUser(legacyUser);
          navigate('/');
        } else if (response.message === 'FIREBASE_ACCOUNT') {
          // Catches specific fail codes preventing valid linked SSO users from using legacy text password overrides explicitly.
          setError('Email already associated with a Google account. Please login with your Google account.');
        } else {
          setError(response.message || 'Failed to log in');
        }
      } catch (backendErr) {
        console.error("Backend login failed:", backendErr);
        
        let errorMessage = 'Failed to log in';
        if (backendErr.message && backendErr.message.includes('401')) {
             errorMessage = 'Invalid email or password';
        } else if (backendErr.message) {
             errorMessage = backendErr.message;
        }
        
        setError(errorMessage);
      }
    }
    
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-[#041529] to-[#2970c2] text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gradient-to-br bg-[#252246] rounded-lg shadow-md">
        <h2 className="text-3xl font-bold text-center">Log In</h2>
        {error && <div className="p-3 text-red-500 bg-red-100 rounded">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              ref={emailRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              type="password"
              ref={passwordRef}
              required
              className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <button
            disabled={loading}
            type="submit"
            className="w-full py-2 font-bold text-white bg-cyan-600 rounded hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            Log In
          </button>
        </form>
        
        <div className="flex items-center justify-between my-4">
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
          <span className="text-xs text-center text-gray-400 uppercase">or</span>
          <span className="w-1/5 border-b border-gray-600 lg:w-1/4"></span>
        </div>

        <button
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center py-2 font-bold text-gray-900 bg-white rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500"
          >
            <FcGoogle className="mr-2 text-2xl" />
            Sign in with Google
        </button>

        <div className="text-center mt-4">
          Need an account? <Link to="/register" className="text-cyan-400 hover:text-cyan-300">Sign Up</Link>
        </div>
      </div>
    </div>
  );
}"""

with open('src/pages/Register.jsx', 'w') as f:
    f.write(register_code)

with open('src/pages/Login.jsx', 'w') as f:
    f.write(login_code)
