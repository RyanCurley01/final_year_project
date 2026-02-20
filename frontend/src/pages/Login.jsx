import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { accountService } from '../redux/services';
import { FcGoogle } from "react-icons/fc";

export default function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login, loginWithGoogle, syncWithBackend, setUser } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleGoogleLogin() {
    try {
      setError("");
      setLoading(true);
      
      console.log("DEBUG: Starting Google Popup Login...");
      const result = await loginWithGoogle();
      console.log("DEBUG: Popup finished, user:", result?.user?.email);
      
      if (result && result.user) {
          await syncWithBackend(result.user);
          console.log("DEBUG: Backend sync complete, navigating to home");
          navigate("/");
      }
    } catch (err) {
      console.error("Google login failed", err);
      // Suppress the COOP error which is often benign in dev
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

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const email = emailRef.current.value;
    const password = passwordRef.current.value;

    try {
      // 1. Try Firebase Login
      const userCredential = await login(email, password);
      const user = userCredential.user;
      const token = await user.getIdToken();
      console.log("DEBUG (Login): Obtained Firebase Token:", token ? `${token.substring(0, 20)}...[truncated]` : "null");

      // 2. Sync/Login with backend
      console.log("DEBUG (Login): Calling accountService.firebaseLogin");
      const backendUser = await accountService.firebaseLogin(token, user.email, user.uid);
      
      // 3. Store user details
      // Combine backend data with Firebase UID for consistent identity checks
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
        const response = await accountService.login(email, password);
        
        if (response.success) {
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
}
