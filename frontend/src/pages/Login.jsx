import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';
import { FcGoogle } from "react-icons/fc";
import { HiEye, HiEyeOff } from "react-icons/hi";

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
  const [showPassword, setShowPassword] = useState(false);
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
      
      // If Firebase rejected the password, show error immediately — don't fall through to legacy login
      if (firebaseErr.code === 'auth/wrong-password' || 
          firebaseErr.code === 'auth/invalid-credential' ||
          firebaseErr.code === 'auth/too-many-requests') {
        setError(firebaseErr.code === 'auth/too-many-requests' 
          ? 'Too many failed attempts. Please try again later.' 
          : 'Invalid email or password');
        setLoading(false);
        return;
      }

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
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                ref={passwordRef}
                required
                className="w-full px-4 py-2 mt-1 bg-gray-800 border border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 text-gray-400 hover:text-white focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
              </button>
            </div>
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
}